/**
 * transactions.test.ts
 * Integration tests for `/api/v1/transactions` against real MySQL + Redis (skipped without
 * DATABASE_URL). Covers the CRUD + trash lifecycle, BR-TX-01..08 validation (amount, VND integer
 * rule, date bounds, category ownership), optimistic locking (TC-12), filters/pagination,
 * idempotent create, history (TC-13), resolve-flag, inline recurring creation (D10), and
 * cross-tenant access (TC-06).
 * Spec: docs/spec/05a §5.4 · docs/spec/07 §7.3.2 · Rules: BR-TX-01..08
 */
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

const { createApp } = await import('../../../src/app.js');
const { prisma } = await import('../../../src/lib/prisma.js');
const { createActiveUser, cleanupTestUsers, flushRateLimits } = await import('../../fixtures/auth.js');
const { addDays, isoWeekday, todayInTimeZone } = await import('../../../src/lib/dates.js');
const { periodKey } = await import('../../../src/lib/recurrence.js');
const { on: onEvent, _resetForTests: resetEventBus } = await import('../../../src/events/bus.js');

describe.skipIf(!process.env.DATABASE_URL)('/api/v1/transactions', () => {
  const app = createApp();

  beforeEach(async () => {
    await flushRateLimits();
  });

  afterEach(async () => {
    resetEventBus();
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

  it('create/read/update/soft-delete/restore happy path', async () => {
    const { accessToken } = await loginAs();
    const category = await getDefaultCategory('expense');

    const create = await request(app)
      .post('/api/v1/transactions')
      .set(auth(accessToken))
      .send({ type: 'expense', categoryId: category.id, amount: '25.00', txnDate: '2026-01-05', description: 'Groceries' });
    expect(create.status).toBe(201);
    expect(create.body).toMatchObject({ amount: '25.00', type: 'expense', version: 1, deletedAt: null });
    const id = create.body.id as string;

    const get = await request(app).get(`/api/v1/transactions/${id}`).set(auth(accessToken));
    expect(get.status).toBe(200);
    expect(get.body.id).toBe(id);

    const update = await request(app).patch(`/api/v1/transactions/${id}`).set(auth(accessToken)).send({ amount: '30.00', version: 1 });
    expect(update.status).toBe(200);
    expect(update.body).toMatchObject({ amount: '30.00', version: 2 });

    const del = await request(app).delete(`/api/v1/transactions/${id}`).set(auth(accessToken));
    expect(del.status).toBe(204);

    const getAfterDelete = await request(app).get(`/api/v1/transactions/${id}`).set(auth(accessToken));
    expect(getAfterDelete.status).toBe(404);

    const restore = await request(app).post(`/api/v1/transactions/${id}/restore`).set(auth(accessToken));
    expect(restore.status).toBe(200);
    expect(restore.body.deletedAt).toBeNull();
  });

  it('TC-11: amount "0" and "-5" are 422', async () => {
    const { accessToken } = await loginAs();
    const category = await getDefaultCategory('expense');

    for (const amount of ['0', '-5']) {
      const res = await request(app)
        .post('/api/v1/transactions')
        .set(auth(accessToken))
        .send({ type: 'expense', categoryId: category.id, amount, txnDate: '2026-01-05' });
      expect(res.status).toBe(422);
    }
  });

  it('VND currency user + amount "1.50" (non-integer) is 422 on the amount field', async () => {
    const { userId, accessToken } = await loginAs();
    await prisma.user.update({ where: { id: userId }, data: { currency: 'VND' } });
    const category = await getDefaultCategory('expense');

    const res = await request(app)
      .post('/api/v1/transactions')
      .set(auth(accessToken))
      .send({ type: 'expense', categoryId: category.id, amount: '1.50', txnDate: '2026-01-05' });

    expect(res.status).toBe(422);
    expect(res.body.errors?.[0]?.field).toBe('amount');
  });

  it('txnDate more than 1 day in the future is 422', async () => {
    const { accessToken } = await loginAs();
    const category = await getDefaultCategory('expense');
    const future = addDays(todayInTimeZone('Asia/Ho_Chi_Minh'), 2);

    const res = await request(app)
      .post('/api/v1/transactions')
      .set(auth(accessToken))
      .send({ type: 'expense', categoryId: category.id, amount: '5.00', txnDate: future });

    expect(res.status).toBe(422);
  });

  it('txnDate before 2000-01-01 is 422', async () => {
    const { accessToken } = await loginAs();
    const category = await getDefaultCategory('expense');

    const res = await request(app)
      .post('/api/v1/transactions')
      .set(auth(accessToken))
      .send({ type: 'expense', categoryId: category.id, amount: '5.00', txnDate: '1999-12-31' });

    expect(res.status).toBe(422);
  });

  it('mass-assignment fields (userId, source, version, merchantKey) in the body are 422 (schema is .strict())', async () => {
    const { accessToken } = await loginAs();
    const category = await getDefaultCategory('expense');

    for (const extra of [
      { userId: 'someone-else' },
      { source: 'import' },
      { version: 99 },
      { merchantKey: 'hacked' },
    ]) {
      const res = await request(app)
        .post('/api/v1/transactions')
        .set(auth(accessToken))
        .send({ type: 'expense', categoryId: category.id, amount: '5.00', txnDate: '2026-01-05', ...extra });
      expect(res.status).toBe(422);
    }
  });

  it('a category belonging to another user is 422 on the categoryId field', async () => {
    const userA = await loginAs();
    const userB = await loginAs();
    const bOwn = await request(app).post('/api/v1/categories').set(auth(userB.accessToken)).send({ name: 'B Only', type: 'expense' });

    const res = await request(app)
      .post('/api/v1/transactions')
      .set(auth(userA.accessToken))
      .send({ type: 'expense', categoryId: bOwn.body.id, amount: '5.00', txnDate: '2026-01-05' });

    expect(res.status).toBe(422);
    expect(res.body.errors?.[0]?.field).toBe('categoryId');
  });

  it('TC-12: PATCH with a stale version is 409 version-mismatch; the current version succeeds', async () => {
    const { accessToken } = await loginAs();
    const category = await getDefaultCategory('expense');
    const create = await request(app)
      .post('/api/v1/transactions')
      .set(auth(accessToken))
      .send({ type: 'expense', categoryId: category.id, amount: '10.00', txnDate: '2026-01-05' });
    const id = create.body.id as string;

    const firstUpdate = await request(app).patch(`/api/v1/transactions/${id}`).set(auth(accessToken)).send({ amount: '11.00', version: 1 });
    expect(firstUpdate.status).toBe(200);
    expect(firstUpdate.body.version).toBe(2);

    const staleUpdate = await request(app).patch(`/api/v1/transactions/${id}`).set(auth(accessToken)).send({ amount: '12.00', version: 1 });
    expect(staleUpdate.status).toBe(409);
    expect(staleUpdate.body.type).toBe('version-mismatch');
  });

  it('list supports filters (type, categoryId, date range, amount range, q with % escaping) and pagination meta', async () => {
    const { accessToken } = await loginAs();
    const expenseCategory = await getDefaultCategory('expense');
    const incomeCategory = await getDefaultCategory('income');

    const mk = (body: Record<string, unknown>) => request(app).post('/api/v1/transactions').set(auth(accessToken)).send(body);

    await mk({ type: 'expense', categoryId: expenseCategory.id, amount: '10.00', txnDate: '2026-01-05', description: 'Lunch' });
    await mk({ type: 'expense', categoryId: expenseCategory.id, amount: '50.00', txnDate: '2026-01-20', description: '50% off sale' });
    await mk({ type: 'income', categoryId: incomeCategory.id, amount: '100.00', txnDate: '2026-01-10', description: 'Payday' });

    const byType = await request(app).get('/api/v1/transactions?type=income').set(auth(accessToken));
    expect(byType.body.data).toHaveLength(1);

    const byCategory = await request(app).get(`/api/v1/transactions?categoryId=${expenseCategory.id}`).set(auth(accessToken));
    expect(byCategory.body.data).toHaveLength(2);

    const byRange = await request(app).get('/api/v1/transactions?from=2026-01-01&to=2026-01-10').set(auth(accessToken));
    expect(byRange.body.data).toHaveLength(2);

    const byAmount = await request(app).get('/api/v1/transactions?minAmount=40&maxAmount=60').set(auth(accessToken));
    expect(byAmount.body.data).toHaveLength(1);

    const byQ = await request(app).get(`/api/v1/transactions?q=${encodeURIComponent('50%')}`).set(auth(accessToken));
    expect(byQ.body.data).toHaveLength(1);
    expect(byQ.body.data[0].description).toBe('50% off sale');

    const paged = await request(app).get('/api/v1/transactions?limit=2&page=1').set(auth(accessToken));
    expect(paged.body.data).toHaveLength(2);
    expect(paged.body.meta).toMatchObject({ page: 1, limit: 2, total: 3, totalPages: 2 });
  });

  it('B-L1/B-L8: an out-of-range categoryId or an absurd page number is a clean 422, not a 500', async () => {
    const { accessToken } = await loginAs();

    const badCategoryId = await request(app).get('/api/v1/transactions?categoryId=9999999999').set(auth(accessToken));
    expect(badCategoryId.status).toBe(422);

    const badPage = await request(app).get('/api/v1/transactions?page=999999999').set(auth(accessToken));
    expect(badPage.status).toBe(422);
  });

  it('?deleted=true only shows trashed rows', async () => {
    const { accessToken } = await loginAs();
    const category = await getDefaultCategory('expense');
    const create = await request(app)
      .post('/api/v1/transactions')
      .set(auth(accessToken))
      .send({ type: 'expense', categoryId: category.id, amount: '5.00', txnDate: '2026-01-05' });
    const id = create.body.id as string;
    await request(app).delete(`/api/v1/transactions/${id}`).set(auth(accessToken));

    const activeList = await request(app).get('/api/v1/transactions').set(auth(accessToken));
    expect(activeList.body.data).toHaveLength(0);

    const trashList = await request(app).get('/api/v1/transactions?deleted=true').set(auth(accessToken));
    expect(trashList.body.data).toHaveLength(1);
    expect(trashList.body.data[0].id).toBe(id);
  });

  it('restore of a non-deleted transaction is 409', async () => {
    const { accessToken } = await loginAs();
    const category = await getDefaultCategory('expense');
    const create = await request(app)
      .post('/api/v1/transactions')
      .set(auth(accessToken))
      .send({ type: 'expense', categoryId: category.id, amount: '5.00', txnDate: '2026-01-05' });

    const res = await request(app).post(`/api/v1/transactions/${create.body.id}/restore`).set(auth(accessToken));
    expect(res.status).toBe(409);
  });

  it('restore of a transaction deleted more than 30 days ago is 404 (purged)', async () => {
    const { accessToken } = await loginAs();
    const category = await getDefaultCategory('expense');
    const create = await request(app)
      .post('/api/v1/transactions')
      .set(auth(accessToken))
      .send({ type: 'expense', categoryId: category.id, amount: '5.00', txnDate: '2026-01-05' });
    const id = create.body.id as string;

    await request(app).delete(`/api/v1/transactions/${id}`).set(auth(accessToken));
    const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    await prisma.transaction.update({ where: { id }, data: { deletedAt: oldDate } });

    const res = await request(app).post(`/api/v1/transactions/${id}/restore`).set(auth(accessToken));
    expect(res.status).toBe(404);
  });

  it('TC-13: history returns create, update, delete, restore in order; changedFields populated on update; emits transaction.updated', async () => {
    const { accessToken } = await loginAs();
    const category = await getDefaultCategory('expense');

    let updatedFired = false;
    onEvent('transaction.updated', () => {
      updatedFired = true;
    });

    const create = await request(app)
      .post('/api/v1/transactions')
      .set(auth(accessToken))
      .send({ type: 'expense', categoryId: category.id, amount: '10.00', txnDate: '2026-01-05', description: 'Original' });
    const id = create.body.id as string;

    await request(app).patch(`/api/v1/transactions/${id}`).set(auth(accessToken)).send({ amount: '15.00', version: 1 });
    await request(app).delete(`/api/v1/transactions/${id}`).set(auth(accessToken));
    await request(app).post(`/api/v1/transactions/${id}/restore`).set(auth(accessToken));

    const history = await request(app).get(`/api/v1/transactions/${id}/history`).set(auth(accessToken));
    expect(history.status).toBe(200);
    const actions = (history.body as Array<{ action: string }>).map((h) => h.action);
    expect(actions).toEqual(['create', 'update', 'delete', 'restore']);

    const updateRow = (history.body as Array<{ action: string; changedFields: Record<string, unknown> }>).find(
      (h) => h.action === 'update',
    );
    expect(updateRow?.changedFields).toMatchObject({ amount: '10.00' });

    // Wait a tick: emitAfterCommit fires on setImmediate, after the response has already been sent.
    await new Promise((resolve) => setImmediate(resolve));
    expect(updatedFired).toBe(true);
  });

  it('the same Idempotency-Key sent twice on POST only creates one transaction; both responses are identical', async () => {
    const { userId, accessToken } = await loginAs();
    const category = await getDefaultCategory('expense');
    const key = `idem-${randomUUID()}`;
    const body = { type: 'expense', categoryId: category.id, amount: '12.34', txnDate: '2026-01-05', description: 'Idempotent Test' };

    const first = await request(app).post('/api/v1/transactions').set(auth(accessToken)).set('Idempotency-Key', key).send(body);
    const second = await request(app).post('/api/v1/transactions').set(auth(accessToken)).set('Idempotency-Key', key).send(body);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);

    const count = await prisma.transaction.count({ where: { userId, description: 'Idempotent Test' } });
    expect(count).toBe(1);
  });

  it('resolve-flag keep clears the flag', async () => {
    const { accessToken } = await loginAs();
    const category = await getDefaultCategory('expense');
    const create = await request(app)
      .post('/api/v1/transactions')
      .set(auth(accessToken))
      .send({ type: 'expense', categoryId: category.id, amount: '5.00', txnDate: '2026-01-05' });
    const id = create.body.id as string;
    await prisma.transaction.update({ where: { id }, data: { isAnomaly: true } });

    const res = await request(app)
      .post(`/api/v1/transactions/${id}/resolve-flag`)
      .set(auth(accessToken))
      .send({ flag: 'anomaly', action: 'keep' });

    expect(res.status).toBe(200);
    expect(res.body.isAnomaly).toBe(false);
  });

  it('D10: POST /transactions with an inline `recurring` field also creates the RecurringRule', async () => {
    const { accessToken } = await loginAs();
    const category = await getDefaultCategory('expense');
    const today = todayInTimeZone('Asia/Ho_Chi_Minh');

    const res = await request(app)
      .post('/api/v1/transactions')
      .set(auth(accessToken))
      .send({
        type: 'expense',
        categoryId: category.id,
        amount: '15.00',
        txnDate: today,
        description: 'Streaming subscription',
        recurring: { frequency: 'weekly' },
      });

    expect(res.status).toBe(201);
    expect(res.body.recurringRule).toBeDefined();
    expect(res.body.recurringRuleId).toBe(res.body.recurringRule.id);
    expect(res.body.recurringPeriod).toBe(periodKey('weekly', today));

    const rule = await prisma.recurringRule.findUniqueOrThrow({ where: { id: res.body.recurringRule.id as number } });
    expect(rule.frequency).toBe('weekly');
    expect(rule.startDate.toISOString().slice(0, 10)).toBe(today);
    expect(rule.dayOfMonth).toBeNull();
    expect(rule.dayOfWeek).toBe(isoWeekday(today));

    const txn = await prisma.transaction.findUniqueOrThrow({ where: { id: res.body.id as string } });
    expect(txn.recurringRuleId).toBe(rule.id);
    expect(txn.recurringPeriod).toBe(periodKey('weekly', today));
  });

  it('creating a 51st recurring rule via the INLINE `recurring` field on POST /transactions is 409 (fix: shares the RECURRING_RULES_MAX cap)', async () => {
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
      .post('/api/v1/transactions')
      .set(auth(accessToken))
      .send({
        type: 'expense',
        categoryId: category.id,
        amount: '15.00',
        txnDate: '2026-01-05',
        description: 'One rule too many',
        recurring: { frequency: 'weekly' },
      });
    expect(res.status).toBe(409);

    // The transaction itself must not have been created either (the whole request is rejected).
    const count = await prisma.transaction.count({ where: { description: 'One rule too many' } });
    expect(count).toBe(0);
  }, 30_000);

  it('TC-06: cross-tenant access to another user\'s transaction is 404 on every endpoint', async () => {
    const userA = await loginAs();
    const userB = await loginAs();
    const category = await getDefaultCategory('expense');
    const create = await request(app)
      .post('/api/v1/transactions')
      .set(auth(userA.accessToken))
      .send({ type: 'expense', categoryId: category.id, amount: '5.00', txnDate: '2026-01-05' });
    const id = create.body.id as string;

    const get = await request(app).get(`/api/v1/transactions/${id}`).set(auth(userB.accessToken));
    expect(get.status).toBe(404);

    const patch = await request(app)
      .patch(`/api/v1/transactions/${id}`)
      .set(auth(userB.accessToken))
      .send({ amount: '6.00', version: 1 });
    expect(patch.status).toBe(404);

    const del = await request(app).delete(`/api/v1/transactions/${id}`).set(auth(userB.accessToken));
    expect(del.status).toBe(404);

    const restore = await request(app).post(`/api/v1/transactions/${id}/restore`).set(auth(userB.accessToken));
    expect(restore.status).toBe(404);

    const history = await request(app).get(`/api/v1/transactions/${id}/history`).set(auth(userB.accessToken));
    expect(history.status).toBe(404);

    const flag = await request(app)
      .post(`/api/v1/transactions/${id}/resolve-flag`)
      .set(auth(userB.accessToken))
      .send({ flag: 'anomaly', action: 'keep' });
    expect(flag.status).toBe(404);
  });

  // ---- P10: server-derived categorySource (D1) -----------------------------------------------

  it('D1: categorySource is derived server-side — a plain create with no AI suggestion is "user"', async () => {
    const { accessToken } = await loginAs();
    const category = await getDefaultCategory('expense');

    const res = await request(app)
      .post('/api/v1/transactions')
      .set(auth(accessToken))
      .send({ type: 'expense', categoryId: category.id, amount: '12.00', txnDate: '2026-01-05' });

    expect(res.status).toBe(201);
    expect(res.body.categorySource).toBe('user');
    expect(res.body.aiSuggestedCategoryId).toBeNull();
  });

  it('D1: a client sending `categorySource` in the body is 422 (schema is .strict())', async () => {
    const { accessToken } = await loginAs();
    const category = await getDefaultCategory('expense');

    const res = await request(app)
      .post('/api/v1/transactions')
      .set(auth(accessToken))
      .send({ type: 'expense', categoryId: category.id, amount: '12.00', txnDate: '2026-01-05', categorySource: 'rule' });

    expect(res.status).toBe(422);
  });

  it('D8: a stale (archived) aiSuggestedCategoryId is dropped silently — 201, categorySource "user", not 422', async () => {
    const { userId, accessToken } = await loginAs();
    const category = await getDefaultCategory('expense');
    // A personal, archived category — cleaned up automatically by cleanupTestUsers() (unlike a
    // real SYSTEM/default row, which would permanently pollute the shared dev database).
    const suggested = await prisma.category.create({
      data: { userId, ownerKey: userId, name: `Archived ${randomUUID()}`, type: 'expense', isActive: false },
    });

    const res = await request(app)
      .post('/api/v1/transactions')
      .set(auth(accessToken))
      .send({
        type: 'expense',
        categoryId: category.id,
        amount: '12.00',
        txnDate: '2026-01-05',
        aiSuggestedCategoryId: suggested.id,
        aiConfidence: '0.800',
      });

    expect(res.status).toBe(201);
    expect(res.body.categorySource).toBe('user');
    expect(res.body.aiSuggestedCategoryId).toBeNull();
    expect(res.body.aiConfidence).toBeNull();
  });

  it('TC-26: a transaction description containing <script> tags is stored and returned as plain text (XSS safe)', async () => {
    const { accessToken } = await loginAs();
    const category = await getDefaultCategory('expense');
    const scriptDescription = 'Payment <script>alert("XSS")</script> at café';

    // Create a transaction with script tags in the description
    const createRes = await request(app)
      .post('/api/v1/transactions')
      .set(auth(accessToken))
      .send({ type: 'expense', categoryId: category.id, amount: '25.00', txnDate: '2026-01-05', description: scriptDescription });

    expect(createRes.status).toBe(201);
    const id = createRes.body.id as string;
    // Verify the description is stored exactly as sent (no escaping in DB)
    expect(createRes.body.description).toBe(scriptDescription);

    // Retrieve the transaction and verify the description is returned as plain text
    const getRes = await request(app).get(`/api/v1/transactions/${id}`).set(auth(accessToken));
    expect(getRes.status).toBe(200);
    expect(getRes.body.description).toBe(scriptDescription);

    // Verify in the database it's stored as plain text (not HTML-escaped)
    const txn = await prisma.transaction.findUniqueOrThrow({ where: { id } });
    expect(txn.description).toBe(scriptDescription);
  });
});
