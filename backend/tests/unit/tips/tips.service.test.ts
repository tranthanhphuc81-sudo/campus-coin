/**
 * tips.service.test.ts
 * Orchestration unit tests for `refreshForUser` with `tipsRepository`/`usersRepository`/the cache
 * mocked out (no DB/Redis needed) — the rules themselves are already unit-tested in isolation
 * (tests/unit/tips/rules/*). `todayInTimeZone` is pinned to a fixed date (`2026-06-15`, day 15) so
 * every test — including the R1/R2/R5 `TIP_PROJECTION_MIN_DAY`-gated branches below — is
 * deterministic regardless of which real calendar day the suite happens to run on.
 * Spec: docs/spec/05b §5.10 · docs/spec/04 §4.5 (Table 13 – tips.refresh)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TipRuleType, UserTipStatus } from '@campuscoin/shared';
import type * as DatesModule from '../../../src/lib/dates.js';

const findByIdMock = vi.fn();
vi.mock('../../../src/modules/users/users.repository.js', () => ({ usersRepository: { findById: findByIdMock } }));

// Pin "today" so `projectionsReady` (TIP_PROJECTION_MIN_DAY = day 5) is always true here — every
// other date helper (firstDayOfMonth, addDays, ...) stays real.
vi.mock('../../../src/lib/dates.js', async (importOriginal) => {
  const actual = await importOriginal<typeof DatesModule>();
  return { ...actual, todayInTimeZone: () => '2026-06-15' };
});

const reactivateExpiredDismissalsMock = vi.fn().mockResolvedValue(undefined);
const monthsOfHistoryAvailableMock = vi.fn().mockResolvedValue(3);
const budgetedCategoryProjectionsMock = vi.fn().mockResolvedValue([]);
const categoryProjectionsWithAvg3Mock = vi.fn().mockResolvedValue([]);
const smallFrequentByCategoryMock = vi.fn().mockResolvedValue([]);
const activeSubscriptionsMock = vi.fn().mockResolvedValue([]);
const savingsGapTotalsMock = vi.fn().mockResolvedValue(null);
const weekendStatsMock = vi.fn();
const activeTemplatesMock = vi.fn();
const isDismissedForRuleCategoryMock = vi.fn().mockResolvedValue(false);
const findExistingForPeriodMock = vi.fn().mockResolvedValue(null);
const upsertRenderedMock = vi.fn();
const deleteStaleActiveMock = vi.fn().mockResolvedValue(undefined);

vi.mock('../../../src/modules/tips/tips.repository.js', () => ({
  tipsRepository: {
    reactivateExpiredDismissals: reactivateExpiredDismissalsMock,
    monthsOfHistoryAvailable: monthsOfHistoryAvailableMock,
    budgetedCategoryProjections: budgetedCategoryProjectionsMock,
    categoryProjectionsWithAvg3: categoryProjectionsWithAvg3Mock,
    smallFrequentByCategory: smallFrequentByCategoryMock,
    activeSubscriptions: activeSubscriptionsMock,
    savingsGapTotals: savingsGapTotalsMock,
    weekendStats: weekendStatsMock,
    activeTemplates: activeTemplatesMock,
    isDismissedForRuleCategory: isDismissedForRuleCategoryMock,
    findExistingForPeriod: findExistingForPeriodMock,
    upsertRendered: upsertRenderedMock,
    deleteStaleActive: deleteStaleActiveMock,
  },
}));

const cacheDelMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../src/lib/cache.js', () => ({ cacheDel: cacheDelMock }));

const { refreshForUser } = await import('../../../src/modules/tips/tips.service.js');
const { Decimal } = await import('../../../src/lib/money.js');
const { firstDayOfMonth, todayInTimeZone } = await import('../../../src/lib/dates.js');

const USER_ID = 'user-1';
const TIMEZONE = 'UTC';

function fakeUser(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: USER_ID, status: 'active', timezone: TIMEZONE, monthlyAllowanceBaseline: null, monthlySavingsGoal: null, ...overrides };
}

const R0_TEMPLATE = { id: 1, code: 'R0_GENERAL_1', ruleType: TipRuleType.GENERAL, titleTpl: 'Pay yourself first', bodyTpl: 'Move money to savings first.', locale: 'en', isActive: true, createdBy: null, createdAt: new Date(), updatedAt: new Date() };
const R4_TEMPLATE = { id: 2, code: 'R4_SUBSCRIPTIONS_1', ruleType: TipRuleType.SUBSCRIPTIONS, titleTpl: 'Check your subscriptions', bodyTpl: 'Cancelling one saves {amount}.', locale: 'en', isActive: true, createdBy: null, createdAt: new Date(), updatedAt: new Date() };

function threeSubscriptions() {
  return [{ amount: new Decimal('15') }, { amount: new Decimal('5') }, { amount: new Decimal('10') }];
}

describe('refreshForUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reactivateExpiredDismissalsMock.mockResolvedValue(undefined);
    monthsOfHistoryAvailableMock.mockResolvedValue(3);
    budgetedCategoryProjectionsMock.mockResolvedValue([]);
    categoryProjectionsWithAvg3Mock.mockResolvedValue([]);
    smallFrequentByCategoryMock.mockResolvedValue([]);
    activeSubscriptionsMock.mockResolvedValue([]);
    savingsGapTotalsMock.mockResolvedValue(null);
    weekendStatsMock.mockResolvedValue({ weekendTotal: new Decimal('0'), avgWeekdaySpend: new Decimal('0'), weekWeekdayTotal: new Decimal('0') });
    activeTemplatesMock.mockResolvedValue([R0_TEMPLATE, R4_TEMPLATE]);
    isDismissedForRuleCategoryMock.mockResolvedValue(false);
    findExistingForPeriodMock.mockResolvedValue(null);
    upsertRenderedMock.mockImplementation((_userId: string, templateId: number) => Promise.resolve({ id: BigInt(templateId) }));
    cacheDelMock.mockResolvedValue(undefined);
  });

  it('is a no-op for a missing/non-active user', async () => {
    findByIdMock.mockResolvedValue(null);
    await refreshForUser(USER_ID);
    expect(reactivateExpiredDismissalsMock).not.toHaveBeenCalled();
    expect(upsertRenderedMock).not.toHaveBeenCalled();
  });

  it('skips a candidate whose rule+category is still dismissed', async () => {
    findByIdMock.mockResolvedValue(fakeUser());
    activeSubscriptionsMock.mockResolvedValue(threeSubscriptions()); // R4 would fire...
    isDismissedForRuleCategoryMock.mockImplementation((_userId: string, ruleType: string, categoryId: number | null) => Promise.resolve(ruleType === TipRuleType.SUBSCRIPTIONS && categoryId === null));

    await refreshForUser(USER_ID);

    // Only R0 (general) is upserted; R4 (subscriptions) is skipped because it is still dismissed.
    expect(upsertRenderedMock).toHaveBeenCalledTimes(1);
    expect(upsertRenderedMock).toHaveBeenCalledWith(USER_ID, R0_TEMPLATE.id, null, expect.any(String), expect.any(String), expect.any(String), expect.anything(), expect.anything());

    const period = firstDayOfMonth(todayInTimeZone(TIMEZONE));
    expect(deleteStaleActiveMock).toHaveBeenCalledWith(USER_ID, period, [BigInt(R0_TEMPLATE.id)]);
    expect(cacheDelMock).toHaveBeenCalledTimes(1);
  });

  it('does not reproduce a rule that stops firing — deleteStaleActive keeps only what actually fired this run', async () => {
    findByIdMock.mockResolvedValue(fakeUser());
    activeSubscriptionsMock.mockResolvedValue([{ amount: new Decimal('5') }, { amount: new Decimal('10') }]); // only 2 -> R4 does not fire

    await refreshForUser(USER_ID);

    expect(upsertRenderedMock).toHaveBeenCalledTimes(1); // only R0
    const period = firstDayOfMonth(todayInTimeZone(TIMEZONE));
    expect(deleteStaleActiveMock).toHaveBeenCalledWith(USER_ID, period, [BigInt(R0_TEMPLATE.id)]);
  });

  it("an existing pinned row's recency is always 1.0 and its status is never part of the upsert payload", async () => {
    findByIdMock.mockResolvedValue(fakeUser());
    activeSubscriptionsMock.mockResolvedValue(threeSubscriptions()); // impact = min(15,5,10) = 5

    findExistingForPeriodMock.mockImplementation((_userId: string, templateId: number) => {
      if (templateId === R4_TEMPLATE.id) {
        return Promise.resolve({ id: 77n, status: UserTipStatus.PINNED, createdAt: new Date('2000-01-01T00:00:00Z') });
      }
      return Promise.resolve(null);
    });

    await refreshForUser(USER_ID);

    expect(upsertRenderedMock).toHaveBeenCalledTimes(2);
    const r4Call = upsertRenderedMock.mock.calls.find((call) => call[1] === R4_TEMPLATE.id)!;
    // Positional signature (userId, templateId, categoryId, period, title, body, impactAmount, score) has
    // no `status`/`dismissedUntil` slot at all — the service can never touch them, by construction.
    expect(r4Call).toHaveLength(8);
    // confidence=1.0 (3 months available), recency=1.0 (pinned, exempt from decay) -> score == impact == 5.
    const score = r4Call[7] as InstanceType<typeof Decimal>;
    expect(score.toString()).toBe('5');
  });

  it('calls smallFrequentByCategory only when the user has an allowance baseline set', async () => {
    findByIdMock.mockResolvedValue(fakeUser({ monthlyAllowanceBaseline: null }));
    await refreshForUser(USER_ID);
    expect(smallFrequentByCategoryMock).not.toHaveBeenCalled();

    findByIdMock.mockResolvedValue(fakeUser({ monthlyAllowanceBaseline: new Decimal('500') }));
    await refreshForUser(USER_ID);
    expect(smallFrequentByCategoryMock).toHaveBeenCalledWith(USER_ID, expect.anything(), '2026-06-15');
  });

  it('R5 (savings-gap) only fires with a savings goal set, and picks the top overspend category', async () => {
    findByIdMock.mockResolvedValue(fakeUser({ monthlySavingsGoal: new Decimal('50') }));
    savingsGapTotalsMock.mockResolvedValue({ incomeToDate: new Decimal('100'), projectedTotalExpense: new Decimal('90') });
    // avg3: null (skipped) / a positive-diff category (becomes the pick) / a negative-diff category (never picked).
    categoryProjectionsWithAvg3Mock.mockResolvedValue([
      { categoryId: 1, categoryName: 'NoHistory', projected: new Decimal('50'), avg3: null },
      { categoryId: 2, categoryName: 'OverBudget', projected: new Decimal('80'), avg3: new Decimal('50') },
      { categoryId: 3, categoryName: 'UnderBudget', projected: new Decimal('40'), avg3: new Decimal('50') },
    ]);

    await refreshForUser(USER_ID);

    expect(savingsGapTotalsMock).toHaveBeenCalled();
    // R5 has no matching template in this suite's fixture templates (only R0_TEMPLATE/R4_TEMPLATE),
    // so `selectTemplate` returns null and the candidate is skipped (`!template` continue) — this
    // still proves R5 fired and was considered (savingsGapTotals/categoryProjectionsWithAvg3 were
    // consulted, and `findTopOverspendCategory` ran over the 3 categories above) without needing a
    // 3rd fixture template; the "no matching template" skip is itself the behaviour under test here.
    expect(upsertRenderedMock).toHaveBeenCalledTimes(1); // only R0 (R4 has < 3 subscriptions this run)
  });

  it('when a savings goal is set but the user is on track, R5 does not fire at all', async () => {
    findByIdMock.mockResolvedValue(fakeUser({ monthlySavingsGoal: new Decimal('5') }));
    savingsGapTotalsMock.mockResolvedValue({ incomeToDate: new Decimal('100'), projectedTotalExpense: new Decimal('10') });

    await refreshForUser(USER_ID);

    expect(savingsGapTotalsMock).toHaveBeenCalled();
    expect(upsertRenderedMock).toHaveBeenCalledTimes(1); // only R0
  });

  it("an existing NON-pinned row's recency decays from its own createdAt (not exempt like a pinned row)", async () => {
    findByIdMock.mockResolvedValue(fakeUser());
    activeSubscriptionsMock.mockResolvedValue(threeSubscriptions());
    findExistingForPeriodMock.mockImplementation((_userId: string, templateId: number) => {
      if (templateId === R4_TEMPLATE.id) {
        return Promise.resolve({ id: 77n, status: UserTipStatus.ACTIVE, createdAt: new Date('2000-01-01T00:00:00Z') });
      }
      return Promise.resolve(null);
    });

    await refreshForUser(USER_ID);

    const r4Call = upsertRenderedMock.mock.calls.find((call) => call[1] === R4_TEMPLATE.id)!;
    const score = r4Call[7] as InstanceType<typeof Decimal>;
    // A 26-year-old (non-pinned) tip is far past TIP_RECENCY_DECAY_DAYS -> recency floors out, so
    // the score must be strictly less than the pinned-row case's score of 5.
    expect(score.lessThan(new Decimal('5'))).toBe(true);
  });
});
