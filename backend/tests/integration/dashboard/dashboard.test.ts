/**
 * dashboard.test.ts
 * Integration tests for `/api/v1/dashboard/summary` against real MySQL + Redis (skipped without
 * DATABASE_URL). Seeds fixture transactions across two months and two expense categories, then
 * asserts the summary's totals/topCategory/categoryBreakdown/monthlyTrend numbers match
 * hand-computed expected values exactly (every aggregate must come from SQL).
 * Spec: docs/spec/05b §5.7 (dashboard widgets) · docs/spec/07 §7.3.3
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

const { createApp } = await import('../../../src/app.js');
const { prisma } = await import('../../../src/lib/prisma.js');
const { createActiveUser, cleanupTestUsers, flushRateLimits } = await import('../../fixtures/auth.js');
const { addDays, firstDayOfMonth, todayInTimeZone } = await import('../../../src/lib/dates.js');

describe.skipIf(!process.env.DATABASE_URL)('/api/v1/dashboard/summary', () => {
  const app = createApp();
  const month = firstDayOfMonth(todayInTimeZone('Asia/Ho_Chi_Minh'));
  const thisMonthDate = todayInTimeZone('Asia/Ho_Chi_Minh');
  const prevMonthDate = addDays(month, -5); // a few days before month start -> lands in the prior month
  const prevMonth = firstDayOfMonth(prevMonthDate);

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

  function getDefaultCategory(type: 'income' | 'expense', name: string) {
    return prisma.category.findFirstOrThrow({ where: { isDefault: true, type, name } });
  }

  async function addTxn(accessToken: string, categoryId: number, type: 'income' | 'expense', amount: string, txnDate: string) {
    const res = await request(app).post('/api/v1/transactions').set(auth(accessToken)).send({ type, categoryId, amount, txnDate });
    expect(res.status).toBe(201);
  }

  it('matches hand-computed totals/topCategory/categoryBreakdown/monthlyTrend from fixture data', async () => {
    const { accessToken } = await loginAs();
    const food = await getDefaultCategory('expense', 'Food');
    const transport = await getDefaultCategory('expense', 'Transport');
    const allowance = await getDefaultCategory('income', 'Allowance');

    // This month: Food 40 + Transport 10 expense, Allowance 100 income.
    await addTxn(accessToken, food.id, 'expense', '40.00', thisMonthDate);
    await addTxn(accessToken, transport.id, 'expense', '10.00', thisMonthDate);
    await addTxn(accessToken, allowance.id, 'income', '100.00', thisMonthDate);

    // Previous month: Food 20 expense, Allowance 50 income.
    await addTxn(accessToken, food.id, 'expense', '20.00', prevMonthDate);
    await addTxn(accessToken, allowance.id, 'income', '50.00', prevMonthDate);

    const res = await request(app).get(`/api/v1/dashboard/summary?month=${month}`).set(auth(accessToken));
    expect(res.status).toBe(200);
    const body = res.body as {
      totals: { income: string; expense: string; net: string; incomeChangePct: number | null; expenseChangePct: number | null };
      topCategory: { categoryId: number; amount: string; sharePct: number } | null;
      categoryBreakdown: Array<{ categoryId: number; amount: string; sharePct: number }>;
      monthlyTrend: Array<{ month: string; income: string; expense: string }>;
      budgets: unknown[];
      savingsGoal: unknown;
      latestInsight: unknown;
      tips: unknown[];
      recentActivity: unknown[];
    };

    expect(body.totals).toMatchObject({ income: '100.00', expense: '50.00', net: '50.00', incomeChangePct: 100, expenseChangePct: 150 });

    expect(body.topCategory).toMatchObject({ categoryId: food.id, amount: '40.00', sharePct: 80 });

    expect(body.categoryBreakdown).toEqual([
      expect.objectContaining({ categoryId: food.id, amount: '40.00', sharePct: 80 }),
      expect.objectContaining({ categoryId: transport.id, amount: '10.00', sharePct: 20 }),
    ]);

    expect(body.monthlyTrend).toHaveLength(6);
    expect(body.monthlyTrend.at(-1)).toMatchObject({ month, income: '100.00', expense: '50.00' });
    expect(body.monthlyTrend.at(-2)).toMatchObject({ month: prevMonth, income: '50.00', expense: '20.00' });
    expect(body.monthlyTrend[0]).toMatchObject({ income: '0.00', expense: '0.00' });

    expect(body.budgets).toEqual([]);
    expect(body.savingsGoal).toBeNull();
    expect(body.latestInsight).toBeNull();
    expect(body.tips).toEqual([]);
    expect(body.recentActivity).toEqual([]);
  });

  it('populates savingsGoal and latestInsight when the user has a goal and a completed insight', async () => {
    const { userId, accessToken } = await loginAs();
    const allowance = await getDefaultCategory('income', 'Allowance');
    await addTxn(accessToken, allowance.id, 'income', '100.00', thisMonthDate);

    const goalRes = await request(app).patch('/api/v1/me').set(auth(accessToken)).send({ monthlySavingsGoal: '40.00' });
    expect(goalRes.status).toBe(200);

    await prisma.insight.create({
      data: {
        userId,
        month: (await import('../../../src/lib/dates.js')).toDbDate(month),
        summaryText: 'You saved a lot this month.',
        generator: 'template',
        status: 'completed',
        regenerateCount: 0,
      },
    });

    const res = await request(app).get(`/api/v1/dashboard/summary?month=${month}`).set(auth(accessToken));
    expect(res.status).toBe(200);
    expect(res.body.savingsGoal).toMatchObject({ targetAmount: '40.00', progressAmount: '100.00' });
    expect(res.body.latestInsight).toMatchObject({ month, summaryText: 'You saved a lot this month.' });
  });

  it('a cache hit on a second call returns the same numbers without recomputation errors', async () => {
    const { accessToken } = await loginAs();
    const food = await getDefaultCategory('expense', 'Food');
    await addTxn(accessToken, food.id, 'expense', '15.00', thisMonthDate);

    const first = await request(app).get(`/api/v1/dashboard/summary?month=${month}`).set(auth(accessToken));
    const second = await request(app).get(`/api/v1/dashboard/summary?month=${month}`).set(auth(accessToken));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
  });
});
