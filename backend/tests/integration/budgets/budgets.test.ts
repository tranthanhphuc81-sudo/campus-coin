/**
 * budgets.test.ts
 * Integration tests for `/api/v1/budgets` against real MySQL + Redis (skipped without
 * DATABASE_URL). Covers bulk upsert + computed consumption (GET), rejecting a non-expense
 * category and a duplicate categoryId in one request, a non-first-of-month `month` (B-M2),
 * copy-previous-month, delete, and cross-tenant access (CLAUDE.md: 404 not 403).
 * Spec: docs/spec/05c §5.11 (budgets & alerts) · docs/spec/07 §7.3.3
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

const { createApp } = await import('../../../src/app.js');
const { prisma } = await import('../../../src/lib/prisma.js');
const { createActiveUser, cleanupTestUsers, flushRateLimits } = await import('../../fixtures/auth.js');
const { addDays, firstDayOfMonth, todayInTimeZone } = await import('../../../src/lib/dates.js');

describe.skipIf(!process.env.DATABASE_URL)('/api/v1/budgets', () => {
  const app = createApp();
  const month = firstDayOfMonth(todayInTimeZone('Asia/Ho_Chi_Minh'));
  const prevMonth = firstDayOfMonth(addDays(month, -1));

  beforeEach(async () => {
    await flushRateLimits();
  });

  afterEach(async () => {
    await cleanupTestUsers();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** Creates an active user and logs in, returning the caller's id and Bearer access token. */
  async function loginAs(): Promise<{ userId: string; accessToken: string }> {
    const user = await createActiveUser();
    const res = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: user.password });
    return { userId: user.id, accessToken: res.body.accessToken as string };
  }

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  function getDefaultCategory(type: 'income' | 'expense', name?: string) {
    return prisma.category.findFirstOrThrow({ where: { isDefault: true, type, ...(name ? { name } : {}) } });
  }

  it('PUT /budgets upserts a budget; GET /budgets returns computed spent/percent/status', async () => {
    const { accessToken } = await loginAs();
    const food = await getDefaultCategory('expense', 'Food');

    const put = await request(app)
      .put('/api/v1/budgets')
      .set(auth(accessToken))
      .send({ month, budgets: [{ categoryId: food.id, limitAmount: '100.00', alertThresholdPct: 80 }] });
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject([{ categoryId: food.id, limitAmount: '100.00', spent: '0.00', percent: 0, status: 'green' }]);
    const budgetId = put.body[0].id as number;

    await request(app)
      .post('/api/v1/transactions')
      .set(auth(accessToken))
      .send({ type: 'expense', categoryId: food.id, amount: '80.00', txnDate: month });

    const list = await request(app).get(`/api/v1/budgets?month=${month}`).set(auth(accessToken));
    expect(list.status).toBe(200);
    const row = (list.body as Array<{ id: number; spent: string; percent: number; status: string }>).find((b) => b.id === budgetId);
    expect(row).toMatchObject({ spent: '80.00', percent: 80, status: 'amber' });
  });

  it('PUT /budgets rejects a non-expense (income) categoryId with 422', async () => {
    const { accessToken } = await loginAs();
    const income = await getDefaultCategory('income');

    const res = await request(app)
      .put('/api/v1/budgets')
      .set(auth(accessToken))
      .send({ month, budgets: [{ categoryId: income.id, limitAmount: '10.00', alertThresholdPct: 80 }] });
    expect(res.status).toBe(422);
  });

  it('PUT /budgets rejects the same categoryId provided twice in one request with 422', async () => {
    const { accessToken } = await loginAs();
    const food = await getDefaultCategory('expense', 'Food');

    const res = await request(app)
      .put('/api/v1/budgets')
      .set(auth(accessToken))
      .send({
        month,
        budgets: [
          { categoryId: food.id, limitAmount: '10.00', alertThresholdPct: 80 },
          { categoryId: food.id, limitAmount: '20.00', alertThresholdPct: 80 },
        ],
      });
    expect(res.status).toBe(422);
  });

  it('B-M2: PUT /budgets with a mid-month date is 422 (month must be the first day of the month)', async () => {
    const { accessToken } = await loginAs();
    const food = await getDefaultCategory('expense', 'Food');
    const midMonth = `${month.slice(0, 8)}15`; // e.g. "2026-09-15" instead of "2026-09-01".

    const res = await request(app)
      .put('/api/v1/budgets')
      .set(auth(accessToken))
      .send({ month: midMonth, budgets: [{ categoryId: food.id, limitAmount: '10.00', alertThresholdPct: 80 }] });
    expect(res.status).toBe(422);
  });

  it('GET /budgets without ?month= defaults to the caller\'s current month', async () => {
    const { accessToken } = await loginAs();
    const food = await getDefaultCategory('expense', 'Food');
    await request(app)
      .put('/api/v1/budgets')
      .set(auth(accessToken))
      .send({ month, budgets: [{ categoryId: food.id, limitAmount: '30.00', alertThresholdPct: 80 }] });

    const res = await request(app).get('/api/v1/budgets').set(auth(accessToken));
    expect(res.status).toBe(200);
    expect((res.body as Array<{ categoryId: number }>).some((b) => b.categoryId === food.id)).toBe(true);
  });

  it('POST /budgets/copy-previous is a no-op when the prior month has no budgets', async () => {
    const { accessToken } = await loginAs();
    const res = await request(app).post('/api/v1/budgets/copy-previous').set(auth(accessToken)).send({ month });
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('POST /budgets/copy-previous copies the prior month budgets (upsert, safe to re-run)', async () => {
    const { accessToken } = await loginAs();
    const food = await getDefaultCategory('expense', 'Food');

    await request(app)
      .put('/api/v1/budgets')
      .set(auth(accessToken))
      .send({ month: prevMonth, budgets: [{ categoryId: food.id, limitAmount: '55.00', alertThresholdPct: 90 }] });

    const copy = await request(app).post('/api/v1/budgets/copy-previous').set(auth(accessToken)).send({ month });
    expect(copy.status).toBe(200);
    const row = (copy.body as Array<{ categoryId: number; limitAmount: string; alertThresholdPct: number }>).find(
      (b) => b.categoryId === food.id,
    );
    expect(row).toMatchObject({ limitAmount: '55.00', alertThresholdPct: 90 });

    // Re-running is a safe no-op/overwrite, never a duplicate or error.
    const copyAgain = await request(app).post('/api/v1/budgets/copy-previous').set(auth(accessToken)).send({ month });
    expect(copyAgain.status).toBe(200);
    expect((copyAgain.body as unknown[]).filter((b: unknown) => (b as { categoryId: number }).categoryId === food.id)).toHaveLength(1);
  });

  it('DELETE /budgets/:id removes it; a cross-tenant DELETE is 404 (not 403)', async () => {
    const userA = await loginAs();
    const userB = await loginAs();
    const food = await getDefaultCategory('expense', 'Food');

    const put = await request(app)
      .put('/api/v1/budgets')
      .set(auth(userA.accessToken))
      .send({ month, budgets: [{ categoryId: food.id, limitAmount: '10.00', alertThresholdPct: 80 }] });
    const id = put.body[0].id as number;

    const crossDelete = await request(app).delete(`/api/v1/budgets/${id}`).set(auth(userB.accessToken));
    expect(crossDelete.status).toBe(404);

    const del = await request(app).delete(`/api/v1/budgets/${id}`).set(auth(userA.accessToken));
    expect(del.status).toBe(204);

    const afterDelete = await prisma.budget.findUnique({ where: { id } });
    expect(afterDelete).toBeNull();
  });
});
