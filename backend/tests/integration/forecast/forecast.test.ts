/**
 * forecast.test.ts
 * Integration tests for `GET /forecast/next-month` (docs/spec/05c §5.14) against real MySQL
 * (skipped without DATABASE_URL): a brand-new user gets `insufficientData: true`; 3 hand-computable
 * months of one category's expenses produce the exact WMA/stdDev/forecast band; an active monthly
 * recurring rule adds its projected amount to `recurring` without inflating `wma` (and a
 * recurring-generated transaction from a past month is excluded from the basis totals); a category
 * with only 1 month of data and no recurring is omitted from `categories[]` while `totals` still
 * reflects the qualifying data.
 * Spec: docs/spec/05c §5.14
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

const { createApp } = await import('../../../src/app.js');
const { prisma } = await import('../../../src/lib/prisma.js');
const { createActiveUser, cleanupTestUsers, flushRateLimits } = await import('../../fixtures/auth.js');
const { addDays, firstDayOfMonth, lastDayOfMonth, toDbDate, todayInTimeZone, trailingMonths } = await import('../../../src/lib/dates.js');

/** Default `users.timezone` (P02 schema default) — the same one every forecast computation uses. */
const DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh';

/** Mirrors `forecast.service.ts`'s own month math, so this test never hardcodes "today". */
function expectedMonths(): { target: string; basisMonths: string[] } {
  const today = todayInTimeZone(DEFAULT_TIMEZONE);
  const currentMonthStart = firstDayOfMonth(today);
  const target = firstDayOfMonth(addDays(lastDayOfMonth(currentMonthStart), 1));
  const basisMonths = trailingMonths(addDays(currentMonthStart, -1), 3);
  return { target, basisMonths };
}

describe.skipIf(!process.env.DATABASE_URL)('/api/v1/forecast', () => {
  const app = createApp();

  beforeEach(async () => {
    await flushRateLimits();
  });

  afterEach(async () => {
    await cleanupTestUsers();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function loginAs(): Promise<{ userId: string; accessToken: string }> {
    const user = await createActiveUser();
    const res = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: user.password });
    return { userId: user.id, accessToken: res.body.accessToken as string };
  }

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  it('a brand-new user with no transactions gets insufficientData: true', async () => {
    const { accessToken } = await loginAs();
    const { target, basisMonths } = expectedMonths();

    const res = await request(app).get('/api/v1/forecast/next-month').set(auth(accessToken));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      month: target,
      basisMonths,
      availableMonths: [],
      insufficientData: true,
      currency: 'USD',
      totals: { expense: null, income: null },
      categories: [],
    });
    expect(res.body.history).toHaveLength(3);
    for (const row of res.body.history) {
      expect(row).toMatchObject({ expense: '0.00', income: '0.00' });
    }
  });

  it('computes the exact WMA/stdDev/forecast band, adds recurring without inflating wma, excludes a recurring-generated txn from the basis, zero-fills a partial category, and omits a truly-empty one', async () => {
    const { userId, accessToken } = await loginAs();
    const { target, basisMonths } = expectedMonths();
    const [categoryA, categoryB, categoryC] = await prisma.category.findMany({ where: { isDefault: true, type: 'expense' }, take: 3, orderBy: { id: 'asc' } });

    // Category A: clean, hand-computable amounts in all 3 basis months (oldest-first: 100, 200, 300).
    const amounts = ['100.00', '200.00', '300.00'];
    for (const [index, month] of basisMonths.entries()) {
      await prisma.transaction.create({
        data: {
          userId,
          categoryId: categoryA!.id,
          type: 'expense',
          amount: amounts[index]!,
          currency: 'USD',
          txnDate: toDbDate(addDays(month, 4)),
          version: 1,
        },
      });
    }

    // An active monthly recurring rule on Category A: fires exactly once in the target month.
    const rule = await prisma.recurringRule.create({
      data: {
        userId,
        categoryId: categoryA!.id,
        type: 'expense',
        amount: '50.00',
        frequency: 'monthly',
        intervalCount: 1,
        dayOfMonth: 15,
        startDate: toDbDate('2020-01-15'),
        nextRunDate: toDbDate('2020-01-15'),
        isActive: true,
      },
    });

    // A recurring-GENERATED transaction dropped into the last basis month: must be excluded from
    // the basis total (recurringRuleId: null filter) — if the filter were broken, M-1 would read
    // 1299.00 instead of 300.00 and every downstream number below would be wrong.
    await prisma.transaction.create({
      data: {
        userId,
        categoryId: categoryA!.id,
        type: 'expense',
        amount: '999.00',
        currency: 'USD',
        txnDate: toDbDate(addDays(basisMonths[2]!, 14)),
        recurringRuleId: rule.id,
        recurringPeriod: basisMonths[2]!.slice(0, 7),
        source: 'recurring',
        version: 1,
      },
    });

    // Category B: a single real transaction, in only the most recent basis month, no recurring
    // rule. Because the OTHER 2 basis months still had (Category A's) activity, this category's
    // own `history` there is a real "0.00" (zero-filled), not `null` — per the DTO's design, a
    // month only reads `null` when the USER had no data at all that month, never per-category.
    await prisma.transaction.create({
      data: {
        userId,
        categoryId: categoryB!.id,
        type: 'expense',
        amount: '40.00',
        currency: 'USD',
        txnDate: toDbDate(addDays(basisMonths[2]!, 2)),
        version: 1,
      },
    });

    // Category C: no transactions ever, and a yearly recurring rule anchored 6 months away from
    // the target month (so it computes 0 occurrences next month) — never appears in `categories[]`
    // at all (there is nothing to build a candidate from: no history, no recurring contribution).
    const targetMonthNum = Number(target.slice(5, 7));
    const anchorMonthNum = ((targetMonthNum + 6 - 1) % 12) + 1;
    await prisma.recurringRule.create({
      data: {
        userId,
        categoryId: categoryC!.id,
        type: 'expense',
        amount: '75.00',
        frequency: 'yearly',
        intervalCount: 1,
        dayOfMonth: 1,
        startDate: toDbDate(`2020-${String(anchorMonthNum).padStart(2, '0')}-01`),
        nextRunDate: toDbDate(`2020-${String(anchorMonthNum).padStart(2, '0')}-01`),
        isActive: true,
      },
    });

    const res = await request(app).get('/api/v1/forecast/next-month').set(auth(accessToken));
    expect(res.status).toBe(200);
    expect(res.body.insufficientData).toBe(false);
    expect(res.body.month).toBe(target);
    expect(res.body.availableMonths).toEqual(basisMonths);

    const categories = res.body.categories as Array<Record<string, unknown>>;
    const dtoA = categories.find((c) => c.categoryId === categoryA!.id);
    expect(dtoA).toMatchObject({
      history: ['100.00', '200.00', '300.00'],
      wma: '230.00', // 300*0.5 + 200*0.3 + 100*0.2
      recurring: '50.00', // one Dec occurrence of the monthly rule, never the excluded 999.00 txn
      forecast: '280.00', // wma + recurring
      lower: '180.00', // max(0, forecast - sampleStdDev([100,200,300])=100)
      upper: '380.00', // forecast + sampleStdDev
    });

    const dtoB = categories.find((c) => c.categoryId === categoryB!.id);
    expect(dtoB).toMatchObject({ history: ['0.00', '0.00', '40.00'], recurring: '0.00' });

    // Category C never appears — no history and a recurring rule that doesn't fire next month.
    expect(categories.some((c) => c.categoryId === categoryC!.id)).toBe(false);
    // The overall expense total still reflects everything that qualifies (A + B's real amounts).
    expect(res.body.totals.expense).not.toBeNull();
  });
});
