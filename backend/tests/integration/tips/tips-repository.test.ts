/**
 * tips-repository.test.ts
 * Direct integration tests for `tipsRepository`'s per-rule aggregate queries (docs/spec/05b
 * §5.10) against real MySQL. The HTTP-level `/api/v1/tips` suite (`tips.test.ts`) only ever
 * exercises rule R0 (always fires, needs no data) through `refreshForUser`; these tests call each
 * repository method directly with realistic fixtures so branches that never fire in that suite —
 * empty-result early returns, `avg3` present vs `null`, the weekday-boundary math in
 * `weekendStats`, and `upsertRendered`'s create-then-update paths — are actually covered.
 * Spec: docs/spec/05b §5.10 (Bảng 23) · docs/spec/12 (testing plan)
 */
import { afterAll, afterEach, describe, expect, it } from 'vitest';

const { prisma } = await import('../../../src/lib/prisma.js');
const { createActiveUser, cleanupTestUsers } = await import('../../fixtures/auth.js');
const { tipsRepository } = await import('../../../src/modules/tips/tips.repository.js');
const { toDbDate } = await import('../../../src/lib/dates.js');
const { Decimal } = await import('../../../src/lib/money.js');

describe.skipIf(!process.env.DATABASE_URL)('tipsRepository', () => {
  /** `TipTemplate` rows created below have no `createdBy` user, so `cleanupTestUsers()`'s cascade
   * never removes them (same issue as `cross-tenant-sweep.test.ts`) — tracked and deleted here. */
  const createdTemplateIds: number[] = [];

  afterEach(async () => {
    await cleanupTestUsers();
    if (createdTemplateIds.length > 0) {
      await prisma.tipTemplate.deleteMany({ where: { id: { in: createdTemplateIds } } });
      createdTemplateIds.length = 0;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function makeCategory(userId: string, name: string, type: 'expense' | 'income' = 'expense') {
    return prisma.category.create({ data: { userId, ownerKey: userId, name, type } });
  }

  async function makeTxn(userId: string, categoryId: number, type: 'expense' | 'income', amount: string, txnDate: string) {
    return prisma.transaction.create({ data: { userId, categoryId, type, amount, currency: 'USD', txnDate: toDbDate(txnDate) } });
  }

  async function makeTemplate(userId: string, ruleType: string) {
    const code = `T_${ruleType}_${userId.slice(0, 8)}_${Math.random().toString(36).slice(2, 6)}`.slice(0, 40);
    const template = await prisma.tipTemplate.create({ data: { code, ruleType: ruleType as never, titleTpl: 'A', bodyTpl: 'B' } });
    createdTemplateIds.push(template.id);
    return template;
  }

  describe('budgetedCategoryProjections (R1)', () => {
    it('returns [] when the user has no budgets this month', async () => {
      const user = await createActiveUser();
      const result = await tipsRepository.budgetedCategoryProjections(user.id, '2026-06-01', '2026-06-15');
      expect(result).toEqual([]);
    });

    it('projects month-end spend from spend-to-date', async () => {
      const user = await createActiveUser();
      const category = await makeCategory(user.id, 'Food');
      await prisma.budget.create({ data: { userId: user.id, categoryId: category.id, month: toDbDate('2026-06-01'), limitAmount: '100.00' } });
      await makeTxn(user.id, category.id, 'expense', '30.00', '2026-06-10');

      const result = await tipsRepository.budgetedCategoryProjections(user.id, '2026-06-01', '2026-06-15');
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ categoryId: category.id, categoryName: 'Food' });
      // projected = 30 / daysElapsed(15) * daysInMonth(June=30) = 60.
      expect(result[0]!.projected.toString()).toBe('60');
    });
  });

  describe('categoryProjectionsWithAvg3 (R2)', () => {
    it('returns [] when there is no expense spend yet this month', async () => {
      const user = await createActiveUser();
      const result = await tipsRepository.categoryProjectionsWithAvg3(user.id, '2026-06-01', '2026-06-15');
      expect(result).toEqual([]);
    });

    it('avg3 is null with no trailing-month data, and set when some trailing months have data', async () => {
      const user = await createActiveUser();
      const withHistory = await makeCategory(user.id, 'Coffee');
      const noHistory = await makeCategory(user.id, 'Gadgets');
      await makeTxn(user.id, withHistory.id, 'expense', '20.00', '2026-06-10');
      await makeTxn(user.id, noHistory.id, 'expense', '50.00', '2026-06-10');
      // Trailing months for June are Mar/Apr/May — history only for `withHistory`.
      await makeTxn(user.id, withHistory.id, 'expense', '10.00', '2026-05-05');
      await makeTxn(user.id, withHistory.id, 'expense', '20.00', '2026-04-05');

      const result = await tipsRepository.categoryProjectionsWithAvg3(user.id, '2026-06-01', '2026-06-15');
      expect(result.find((r) => r.categoryId === withHistory.id)?.avg3).not.toBeNull();
      expect(result.find((r) => r.categoryId === noHistory.id)?.avg3).toBeNull();
    });
  });

  describe('smallFrequentByCategory (R3)', () => {
    it('returns [] when there is nothing at all in the trailing window', async () => {
      const user = await createActiveUser();
      const result = await tipsRepository.smallFrequentByCategory(user.id, new Decimal('1000'), '2026-06-15');
      expect(result).toEqual([]);
    });

    it('sums transactions below the allowance threshold, ignores ones above it', async () => {
      const user = await createActiveUser();
      const category = await makeCategory(user.id, 'Snacks');
      await makeTxn(user.id, category.id, 'expense', '2.00', '2026-06-14'); // below 5% of 1000 = 50
      await makeTxn(user.id, category.id, 'expense', '3.00', '2026-06-13');
      await makeTxn(user.id, category.id, 'expense', '999.00', '2026-06-12'); // above threshold, excluded

      const result = await tipsRepository.smallFrequentByCategory(user.id, new Decimal('1000'), '2026-06-15');
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ categoryId: category.id, categoryName: 'Snacks', smallTxnCount: 2 });
      expect(result[0]!.smallTxnSum.toString()).toBe('5');
    });
  });

  describe('activeSubscriptions (R4)', () => {
    it('filters to only active expense recurring rules named "Subscriptions"', async () => {
      const user = await createActiveUser();
      const subs = await makeCategory(user.id, 'Subscriptions');
      const other = await makeCategory(user.id, 'Other');
      const base = { userId: user.id, type: 'expense' as const, frequency: 'monthly' as const, dayOfMonth: 1, startDate: toDbDate('2026-01-01'), nextRunDate: toDbDate('2026-07-01'), isActive: true };
      await prisma.recurringRule.create({ data: { ...base, categoryId: subs.id, amount: '9.99' } });
      await prisma.recurringRule.create({ data: { ...base, categoryId: other.id, amount: '5.00' } });
      await prisma.recurringRule.create({ data: { ...base, categoryId: subs.id, amount: '4.99', isActive: false } });

      const result = await tipsRepository.activeSubscriptions(user.id);
      expect(result).toHaveLength(1);
      expect(result[0]!.amount.toString()).toBe('9.99');
    });
  });

  describe('savingsGapTotals (R5)', () => {
    it('defaults the missing side (income or expense) to 0', async () => {
      const user = await createActiveUser();
      const category = await makeCategory(user.id, 'Salary', 'income');
      await makeTxn(user.id, category.id, 'income', '500.00', '2026-06-05');

      const result = await tipsRepository.savingsGapTotals(user.id, '2026-06-01', '2026-06-15');
      expect(result.incomeToDate.toString()).toBe('500');
      expect(result.projectedTotalExpense.toString()).toBe('0');
    });
  });

  describe('weekendStats (R6)', () => {
    it('anchors Saturday/Sunday/Monday "today" values to the same most-recent weekend', async () => {
      const user = await createActiveUser();
      const category = await makeCategory(user.id, 'Fun');
      await makeTxn(user.id, category.id, 'expense', '40.00', '2026-06-06'); // the Saturday itself

      // wd=6 (Sat), wd=7 (Sun), and the `else` branch (Mon, wd+1=2) all resolve to 06-06/06-07.
      for (const today of ['2026-06-06', '2026-06-07', '2026-06-08']) {
        const result = await tipsRepository.weekendStats(user.id, today);
        expect(result.weekendTotal.toString(), `today=${today}`).toBe('40');
      }
    });

    it('excludes weekend days from the trailing weekday baseline', async () => {
      const user = await createActiveUser();
      const category = await makeCategory(user.id, 'Fun');
      // Baseline window for the 2026-06-06/07 weekend is 2026-05-04..2026-05-31.
      await makeTxn(user.id, category.id, 'expense', '10.00', '2026-05-06'); // Wednesday: counted
      await makeTxn(user.id, category.id, 'expense', '99.00', '2026-05-09'); // Saturday: excluded

      const result = await tipsRepository.weekendStats(user.id, '2026-06-07');
      // avgWeekdaySpend = 10 / (4 weeks * 5 weekdays) = 0.5 — the 99 Saturday txn must not be in it.
      expect(result.avgWeekdaySpend.toString()).toBe('0.5');
    });
  });

  describe('monthsOfHistoryAvailable', () => {
    it('counts only the trailing months that actually have a transaction', async () => {
      const user = await createActiveUser();
      const category = await makeCategory(user.id, 'Misc');
      await makeTxn(user.id, category.id, 'expense', '5.00', '2026-05-10'); // one of the 3 trailing months
      expect(await tipsRepository.monthsOfHistoryAvailable(user.id, '2026-06-01')).toBe(1);
    });

    it('returns 0 when none of the trailing months has any transaction', async () => {
      const user = await createActiveUser();
      expect(await tipsRepository.monthsOfHistoryAvailable(user.id, '2026-06-01')).toBe(0);
    });
  });

  describe('upsertRendered', () => {
    it('creates then updates a categoryId:null row (R0/R4/R6 shape)', async () => {
      const user = await createActiveUser();
      const template = await makeTemplate(user.id, 'general');

      const created = await tipsRepository.upsertRendered(user.id, template.id, null, '2026-06-01', 'Title', 'Body', new Decimal('1.00'), new Decimal('0.5'));
      const updated = await tipsRepository.upsertRendered(user.id, template.id, null, '2026-06-01', 'Title 2', 'Body 2', new Decimal('2.00'), new Decimal('0.6'));

      expect(updated.id).toBe(created.id);
      expect(updated.renderedTitle).toBe('Title 2');
    });

    it('creates then updates a categoryId-scoped row', async () => {
      const user = await createActiveUser();
      const category = await makeCategory(user.id, 'Cat');
      const template = await makeTemplate(user.id, 'over_budget');

      const created = await tipsRepository.upsertRendered(user.id, template.id, category.id, '2026-06-01', 'Title', 'Body', new Decimal('1.00'), new Decimal('0.5'));
      const updated = await tipsRepository.upsertRendered(user.id, template.id, category.id, '2026-06-01', 'Title 2', 'Body 2', new Decimal('2.00'), new Decimal('0.6'));

      expect(updated.id).toBe(created.id);
      expect(updated.renderedTitle).toBe('Title 2');
    });
  });

  describe('isDismissedForRuleCategory', () => {
    it('is false with no dismissal, true once a still-in-window dismissal exists', async () => {
      const user = await createActiveUser();
      const template = await makeTemplate(user.id, 'general');

      expect(await tipsRepository.isDismissedForRuleCategory(user.id, 'general', null, '2026-06-15')).toBe(false);

      await prisma.userTip.create({
        data: {
          userId: user.id,
          templateId: template.id,
          categoryId: null,
          period: toDbDate('2026-06-01'),
          renderedTitle: 'T',
          renderedBody: 'B',
          impactAmount: '0',
          score: '0',
          status: 'dismissed',
          dismissedUntil: toDbDate('2026-07-01'),
        },
      });

      expect(await tipsRepository.isDismissedForRuleCategory(user.id, 'general', null, '2026-06-15')).toBe(true);
    });
  });

  describe('findByIds / categoriesByIds', () => {
    it('short-circuit to an empty result for an empty id list', async () => {
      expect(await tipsRepository.findByIds('irrelevant-user-id', [])).toEqual([]);
      expect(await tipsRepository.categoriesByIds([])).toEqual(new Map());
    });

    it('return the matching rows/categories for a non-empty id list', async () => {
      const user = await createActiveUser();
      const category = await makeCategory(user.id, 'Cat2');
      const template = await makeTemplate(user.id, 'general');
      const tip = await prisma.userTip.create({
        data: {
          userId: user.id,
          templateId: template.id,
          categoryId: category.id,
          period: toDbDate('2026-06-01'),
          renderedTitle: 'T',
          renderedBody: 'B',
          impactAmount: '0',
          score: '0',
        },
      });

      const found = await tipsRepository.findByIds(user.id, [tip.id]);
      expect(found).toHaveLength(1);
      const categories = await tipsRepository.categoriesByIds([category.id]);
      expect(categories.get(category.id)?.name).toBe('Cat2');
    });
  });
});
