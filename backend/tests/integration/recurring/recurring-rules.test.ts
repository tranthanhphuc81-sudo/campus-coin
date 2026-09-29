/**
 * recurring-rules.test.ts
 * Integration tests for `/api/v1/recurring-rules` against real MySQL + Redis (skipped without
 * DATABASE_URL). Covers the CRUD happy path, the create-time cross-field/endDate validation,
 * the RECURRING_RULES_MAX cap (409), the PATCH `nextRunDate` recomputation rules (D12: change vs
 * pause vs resume), DELETE surviving a previously generated transaction (`recurringRuleId: null`),
 * and cross-tenant access (TC-06).
 * Spec: docs/spec/05a §5.4.2 · docs/spec/07 §7.3.2
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

const { createApp } = await import('../../../src/app.js');
const { prisma } = await import('../../../src/lib/prisma.js');
const { createActiveUser, cleanupTestUsers, flushRateLimits } = await import('../../fixtures/auth.js');
const { todayInTimeZone } = await import('../../../src/lib/dates.js');

describe.skipIf(!process.env.DATABASE_URL)('/api/v1/recurring-rules', () => {
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

  /** Creates an active user and logs in, returning the caller's id and Bearer access token. */
  async function loginAs(): Promise<{ userId: string; accessToken: string }> {
    const user = await createActiveUser();
    const res = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: user.password });
    return { userId: user.id, accessToken: res.body.accessToken as string };
  }

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  function getDefaultCategory(type: 'income' | 'expense') {
    return prisma.category.findFirstOrThrow({ where: { isDefault: true, type } });
  }

  it('create/list/patch/delete happy path', async () => {
    const { accessToken } = await loginAs();
    const category = await getDefaultCategory('expense');
    const today = todayInTimeZone('Asia/Ho_Chi_Minh');

    const create = await request(app)
      .post('/api/v1/recurring-rules')
      .set(auth(accessToken))
      .send({ type: 'expense', categoryId: category.id, amount: '9.99', frequency: 'monthly', dayOfMonth: 15, startDate: today });
    expect(create.status).toBe(201);
    expect(create.body).toMatchObject({ frequency: 'monthly', dayOfMonth: 15, isActive: true });
    const id = create.body.id as number;

    const list = await request(app).get('/api/v1/recurring-rules').set(auth(accessToken));
    expect(list.status).toBe(200);
    expect((list.body as Array<{ id: number }>).some((r) => r.id === id)).toBe(true);

    const patch = await request(app).patch(`/api/v1/recurring-rules/${id}`).set(auth(accessToken)).send({ amount: '12.00' });
    expect(patch.status).toBe(200);
    expect(patch.body.amount).toBe('12.00');

    const del = await request(app).delete(`/api/v1/recurring-rules/${id}`).set(auth(accessToken));
    expect(del.status).toBe(204);

    const afterDelete = await prisma.recurringRule.findUnique({ where: { id } });
    expect(afterDelete).toBeNull();
  });

  it('create weekly without dayOfWeek is 422', async () => {
    const { accessToken } = await loginAs();
    const category = await getDefaultCategory('expense');

    const res = await request(app)
      .post('/api/v1/recurring-rules')
      .set(auth(accessToken))
      .send({ type: 'expense', categoryId: category.id, amount: '5.00', frequency: 'weekly', startDate: '2026-01-05' });

    expect(res.status).toBe(422);
    expect(res.body.errors?.[0]?.field).toBe('dayOfWeek');
  });

  it('create monthly without dayOfMonth is 422', async () => {
    const { accessToken } = await loginAs();
    const category = await getDefaultCategory('expense');

    const res = await request(app)
      .post('/api/v1/recurring-rules')
      .set(auth(accessToken))
      .send({ type: 'expense', categoryId: category.id, amount: '5.00', frequency: 'monthly', startDate: '2026-01-05' });

    expect(res.status).toBe(422);
    expect(res.body.errors?.[0]?.field).toBe('dayOfMonth');
  });

  it('create with endDate before startDate is 422 (Zod-level smoke test)', async () => {
    const { accessToken } = await loginAs();
    const category = await getDefaultCategory('expense');

    const res = await request(app)
      .post('/api/v1/recurring-rules')
      .set(auth(accessToken))
      .send({
        type: 'expense',
        categoryId: category.id,
        amount: '5.00',
        frequency: 'monthly',
        dayOfMonth: 5,
        startDate: '2026-01-05',
        endDate: '2026-01-01',
      });

    expect(res.status).toBe(422);
  });

  it('fix #2: create with a VND-currency user and a non-whole amount is 422 on field amount', async () => {
    const { userId, accessToken } = await loginAs();
    await prisma.user.update({ where: { id: userId }, data: { currency: 'VND' } });
    const category = await getDefaultCategory('expense');

    const res = await request(app)
      .post('/api/v1/recurring-rules')
      .set(auth(accessToken))
      .send({ type: 'expense', categoryId: category.id, amount: '12.50', frequency: 'monthly', dayOfMonth: 15, startDate: '2026-01-15' });

    expect(res.status).toBe(422);
    expect(res.body.errors?.[0]?.field).toBe('amount');
  });

  it('fix #2: PATCH with a VND-currency user and a non-whole amount is 422 on field amount', async () => {
    const { userId, accessToken } = await loginAs();
    const category = await getDefaultCategory('expense');

    const create = await request(app)
      .post('/api/v1/recurring-rules')
      .set(auth(accessToken))
      .send({ type: 'expense', categoryId: category.id, amount: '9.99', frequency: 'monthly', dayOfMonth: 15, startDate: '2026-01-15' });
    const id = create.body.id as number;

    await prisma.user.update({ where: { id: userId }, data: { currency: 'VND' } });

    const patch = await request(app).patch(`/api/v1/recurring-rules/${id}`).set(auth(accessToken)).send({ amount: '12.50' });
    expect(patch.status).toBe(422);
    expect(patch.body.errors?.[0]?.field).toBe('amount');
  });

  it('creating a 51st recurring rule is 409', async () => {
    const { accessToken } = await loginAs();
    const category = await getDefaultCategory('expense');

    for (let i = 1; i <= 50; i += 1) {
      const res = await request(app)
        .post('/api/v1/recurring-rules')
        .set(auth(accessToken))
        .send({ type: 'expense', categoryId: category.id, amount: '1.00', frequency: 'monthly', dayOfMonth: 1, startDate: '2026-01-01' });
      expect(res.status).toBe(201);
    }

    const res = await request(app)
      .post('/api/v1/recurring-rules')
      .set(auth(accessToken))
      .send({ type: 'expense', categoryId: category.id, amount: '1.00', frequency: 'monthly', dayOfMonth: 1, startDate: '2026-01-01' });
    expect(res.status).toBe(409);
  }, 30_000);

  it('D12: PATCH changing frequency recomputes nextRunDate', async () => {
    const { accessToken } = await loginAs();
    const category = await getDefaultCategory('expense');
    const today = todayInTimeZone('Asia/Ho_Chi_Minh');

    const create = await request(app)
      .post('/api/v1/recurring-rules')
      .set(auth(accessToken))
      .send({ type: 'expense', categoryId: category.id, amount: '9.99', frequency: 'monthly', dayOfMonth: 15, startDate: '2020-01-15' });
    const id = create.body.id as number;
    const before = await prisma.recurringRule.findUniqueOrThrow({ where: { id } });

    const patch = await request(app)
      .patch(`/api/v1/recurring-rules/${id}`)
      .set(auth(accessToken))
      .send({ frequency: 'weekly', dayOfWeek: 3, dayOfMonth: null });
    expect(patch.status).toBe(200);

    const after = await prisma.recurringRule.findUniqueOrThrow({ where: { id } });
    expect(after.nextRunDate.getTime()).not.toBe(before.nextRunDate.getTime());
    expect(after.nextRunDate.toISOString().slice(0, 10) >= today).toBe(true);
  });

  it('D12: PATCH pausing (isActive:false) does NOT recompute nextRunDate', async () => {
    const { accessToken } = await loginAs();
    const category = await getDefaultCategory('expense');

    const create = await request(app)
      .post('/api/v1/recurring-rules')
      .set(auth(accessToken))
      .send({ type: 'expense', categoryId: category.id, amount: '9.99', frequency: 'monthly', dayOfMonth: 15, startDate: '2026-01-15' });
    const id = create.body.id as number;
    const before = await prisma.recurringRule.findUniqueOrThrow({ where: { id } });

    const patch = await request(app).patch(`/api/v1/recurring-rules/${id}`).set(auth(accessToken)).send({ isActive: false });
    expect(patch.status).toBe(200);
    expect(patch.body.isActive).toBe(false);

    const after = await prisma.recurringRule.findUniqueOrThrow({ where: { id } });
    expect(after.nextRunDate.getTime()).toBe(before.nextRunDate.getTime());
  });

  it('D12: PATCH resuming (isActive:false -> true) DOES recompute nextRunDate', async () => {
    const { accessToken } = await loginAs();
    const category = await getDefaultCategory('expense');
    const today = todayInTimeZone('Asia/Ho_Chi_Minh');

    const create = await request(app)
      .post('/api/v1/recurring-rules')
      .set(auth(accessToken))
      .send({ type: 'expense', categoryId: category.id, amount: '9.99', frequency: 'monthly', dayOfMonth: 15, startDate: '2020-01-15' });
    const id = create.body.id as number;

    // Simulate a stale nextRunDate (as if the rule had been paused for a long time).
    await prisma.recurringRule.update({ where: { id }, data: { isActive: false, nextRunDate: new Date('2020-02-15T00:00:00.000Z') } });

    const patch = await request(app).patch(`/api/v1/recurring-rules/${id}`).set(auth(accessToken)).send({ isActive: true });
    expect(patch.status).toBe(200);

    const after = await prisma.recurringRule.findUniqueOrThrow({ where: { id } });
    expect(after.nextRunDate.toISOString().slice(0, 10) >= today).toBe(true);
  });

  it('PATCH weekly rule setting an inconsistent day field is 422', async () => {
    const { accessToken } = await loginAs();
    const category = await getDefaultCategory('expense');

    const create = await request(app)
      .post('/api/v1/recurring-rules')
      .set(auth(accessToken))
      .send({ type: 'expense', categoryId: category.id, amount: '9.99', frequency: 'weekly', dayOfWeek: 2, startDate: '2026-01-05' });
    const id = create.body.id as number;

    // Switching to monthly without dropping dayOfWeek / adding dayOfMonth violates the merged state.
    const patch = await request(app).patch(`/api/v1/recurring-rules/${id}`).set(auth(accessToken)).send({ frequency: 'monthly' });
    expect(patch.status).toBe(422);
  });

  it('DELETE removes the rule but a transaction it generated survives with recurringRuleId: null', async () => {
    const { accessToken } = await loginAs();
    const category = await getDefaultCategory('expense');
    const today = todayInTimeZone('Asia/Ho_Chi_Minh');

    const createTxn = await request(app)
      .post('/api/v1/transactions')
      .set(auth(accessToken))
      .send({
        type: 'expense',
        categoryId: category.id,
        amount: '20.00',
        txnDate: today,
        description: 'Gym membership',
        recurring: { frequency: 'monthly' },
      });
    expect(createTxn.status).toBe(201);
    const txnId = createTxn.body.id as string;
    const ruleId = createTxn.body.recurringRule.id as number;

    const del = await request(app).delete(`/api/v1/recurring-rules/${ruleId}`).set(auth(accessToken));
    expect(del.status).toBe(204);

    const txn = await prisma.transaction.findUniqueOrThrow({ where: { id: txnId } });
    expect(txn.recurringRuleId).toBeNull();
  });

  it('TC-06: cross-tenant PATCH/DELETE on another user\'s rule is 404 (not 403)', async () => {
    const userA = await loginAs();
    const userB = await loginAs();
    const category = await getDefaultCategory('expense');

    const create = await request(app)
      .post('/api/v1/recurring-rules')
      .set(auth(userA.accessToken))
      .send({ type: 'expense', categoryId: category.id, amount: '9.99', frequency: 'monthly', dayOfMonth: 15, startDate: '2026-01-15' });
    const id = create.body.id as number;

    const patch = await request(app).patch(`/api/v1/recurring-rules/${id}`).set(auth(userB.accessToken)).send({ amount: '1.00' });
    expect(patch.status).toBe(404);

    const del = await request(app).delete(`/api/v1/recurring-rules/${id}`).set(auth(userB.accessToken));
    expect(del.status).toBe(404);
  });
});
