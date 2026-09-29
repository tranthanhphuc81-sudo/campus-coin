/**
 * categories.test.ts
 * Integration tests for `/api/v1/categories` against real MySQL + Redis (skipped without
 * DATABASE_URL). Covers listing (defaults + own, includeInactive), create (name clashes with own
 * and default categories, the 50-category cap), update/delete of a default category (404, BR-CA-02),
 * delete/archive/reassign (BR-CA-03/BR-CA-04, TC-09, TC-10) and cross-tenant access (TC-06).
 * Spec: docs/spec/05a §5.3 · docs/spec/07 §7.3.2 · Rules: BR-CA-01..05
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

const { createApp } = await import('../../../src/app.js');
const { prisma } = await import('../../../src/lib/prisma.js');
const { createActiveUser, cleanupTestUsers, flushRateLimits } = await import('../../fixtures/auth.js');
const { on: onEvent, _resetForTests: resetEventBus } = await import('../../../src/events/bus.js');
const { registerCacheInvalidatorHandler } = await import('../../../src/events/handlers/cache-invalidator.handler.js');
const { cacheGet, cacheSet } = await import('../../../src/lib/cache.js');
const { dashboardKey } = await import('../../../src/lib/cacheKeys.js');
const { firstDayOfMonth } = await import('../../../src/lib/dates.js');

describe.skipIf(!process.env.DATABASE_URL)('/api/v1/categories', () => {
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

  /** Creates an active user and logs in, returning the Bearer access token. */
  async function loginAs(): Promise<{ userId: string; accessToken: string }> {
    const user = await createActiveUser();
    const res = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: user.password });
    return { userId: user.id, accessToken: res.body.accessToken as string };
  }

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  it('GET /categories returns system defaults plus the caller\'s own categories', async () => {
    const { accessToken } = await loginAs();
    const create = await request(app)
      .post('/api/v1/categories')
      .set(auth(accessToken))
      .send({ name: 'My Custom Category', type: 'expense' });
    expect(create.status).toBe(201);

    const res = await request(app).get('/api/v1/categories').set(auth(accessToken));

    expect(res.status).toBe(200);
    const names = (res.body as Array<{ name: string; isDefault: boolean }>).map((c) => c.name);
    expect(names).toContain('Food'); // a system default
    expect(names).toContain('My Custom Category');
  });

  it('GET /categories?includeInactive=true also returns the caller\'s own archived categories', async () => {
    const { accessToken } = await loginAs();
    const create = await request(app)
      .post('/api/v1/categories')
      .set(auth(accessToken))
      .send({ name: 'Archived One', type: 'expense' });
    const id = create.body.id as number;

    await request(app).patch(`/api/v1/categories/${id}`).set(auth(accessToken)).send({ isActive: false });

    const withoutInactive = await request(app).get('/api/v1/categories').set(auth(accessToken));
    expect((withoutInactive.body as Array<{ name: string }>).map((c) => c.name)).not.toContain('Archived One');

    const withInactive = await request(app).get('/api/v1/categories?includeInactive=true').set(auth(accessToken));
    expect((withInactive.body as Array<{ name: string }>).map((c) => c.name)).toContain('Archived One');
  });

  it('POST /categories creates a personal category (201)', async () => {
    const { accessToken } = await loginAs();
    const res = await request(app)
      .post('/api/v1/categories')
      .set(auth(accessToken))
      .send({ name: 'Side Hustle', type: 'income', icon: 'cash', color: '#112233' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Side Hustle', type: 'income', isDefault: false, isActive: true });
  });

  it('POST /categories with a name clashing with the caller\'s own category is 409', async () => {
    const { accessToken } = await loginAs();
    await request(app).post('/api/v1/categories').set(auth(accessToken)).send({ name: 'Dup', type: 'expense' });

    const res = await request(app).post('/api/v1/categories').set(auth(accessToken)).send({ name: 'Dup', type: 'expense' });
    expect(res.status).toBe(409);
  });

  it('TC-09: POST /categories with a name clashing with a default category of the same type is 409', async () => {
    const { accessToken } = await loginAs();
    const res = await request(app).post('/api/v1/categories').set(auth(accessToken)).send({ name: 'Food', type: 'expense' });
    expect(res.status).toBe(409);
  });

  it('BR-CA-04: creating a 51st personal category is 409', async () => {
    const { accessToken } = await loginAs();
    for (let i = 1; i <= 50; i += 1) {
      const res = await request(app)
        .post('/api/v1/categories')
        .set(auth(accessToken))
        .send({ name: `Personal Category ${i}`, type: 'expense' });
      expect(res.status).toBe(201);
    }

    const res = await request(app)
      .post('/api/v1/categories')
      .set(auth(accessToken))
      .send({ name: 'One Too Many', type: 'expense' });
    expect(res.status).toBe(409);
  }, 30_000);

  it('BR-CA-02: PATCH/DELETE targeting a default category\'s real id is 404', async () => {
    const { accessToken } = await loginAs();
    const defaultCategory = await prisma.category.findFirstOrThrow({ where: { isDefault: true, type: 'expense' } });

    const patch = await request(app)
      .patch(`/api/v1/categories/${defaultCategory.id}`)
      .set(auth(accessToken))
      .send({ name: 'Hacked Name' });
    expect(patch.status).toBe(404);

    const del = await request(app).delete(`/api/v1/categories/${defaultCategory.id}`).set(auth(accessToken));
    expect(del.status).toBe(404);
  });

  it('B-L1: PATCH/DELETE with an out-of-range id (above INT32) is a clean 422, not a 500', async () => {
    const { accessToken } = await loginAs();

    const patch = await request(app)
      .patch('/api/v1/categories/9999999999')
      .set(auth(accessToken))
      .send({ name: 'Whatever' });
    expect(patch.status).toBe(422);

    const del = await request(app).delete('/api/v1/categories/9999999999').set(auth(accessToken));
    expect(del.status).toBe(422);
  });

  it('TC-06: user B PATCH/DELETE-ing user A\'s own category is 404 (not 403)', async () => {
    const userA = await loginAs();
    const userB = await loginAs();
    const create = await request(app)
      .post('/api/v1/categories')
      .set(auth(userA.accessToken))
      .send({ name: 'Only Mine', type: 'expense' });
    const id = create.body.id as number;

    const patch = await request(app)
      .patch(`/api/v1/categories/${id}`)
      .set(auth(userB.accessToken))
      .send({ name: 'Stolen' });
    expect(patch.status).toBe(404);

    const del = await request(app).delete(`/api/v1/categories/${id}`).set(auth(userB.accessToken));
    expect(del.status).toBe(404);
  });

  /** Creates a category and one transaction referencing it, so the category is "in use". */
  async function createCategoryInUse(accessToken: string): Promise<number> {
    const create = await request(app)
      .post('/api/v1/categories')
      .set(auth(accessToken))
      .send({ name: 'In Use Category', type: 'expense' });
    const categoryId = create.body.id as number;

    const txn = await request(app)
      .post('/api/v1/transactions')
      .set(auth(accessToken))
      .send({ type: 'expense', categoryId, amount: '20.00', txnDate: '2026-01-15', description: 'Coffee' });
    expect(txn.status).toBe(201);

    return categoryId;
  }

  it('DELETE an in-use category with neither reassignTo nor archive is 409', async () => {
    const { accessToken } = await loginAs();
    const categoryId = await createCategoryInUse(accessToken);

    const res = await request(app).delete(`/api/v1/categories/${categoryId}`).set(auth(accessToken));
    expect(res.status).toBe(409);
  });

  it('DELETE ?archive=true archives the category (200); old transactions keep referencing it', async () => {
    const { accessToken } = await loginAs();
    const categoryId = await createCategoryInUse(accessToken);

    const res = await request(app).delete(`/api/v1/categories/${categoryId}?archive=true`).set(auth(accessToken));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: categoryId, isActive: false });

    const stillReferenced = await prisma.transaction.findFirst({ where: { categoryId } });
    expect(stillReferenced).not.toBeNull();
  });

  it('TC-10: DELETE ?reassignTo=<id> moves transactions to the target and writes history, then deletes the category', async () => {
    const { accessToken } = await loginAs();
    const categoryId = await createCategoryInUse(accessToken);
    const target = await prisma.category.findFirstOrThrow({ where: { isDefault: true, type: 'expense', name: { not: 'Food' } } });

    const res = await request(app)
      .delete(`/api/v1/categories/${categoryId}?reassignTo=${target.id}`)
      .set(auth(accessToken));
    expect(res.status).toBe(204);

    const moved = await prisma.transaction.findMany({ where: { categoryId: target.id } });
    expect(moved.length).toBeGreaterThan(0);

    const historyRows = await prisma.transactionHistory.findMany({ where: { transactionId: moved[0]!.id } });
    const updateRow = historyRows.find((h) => h.action === 'update');
    expect(updateRow).toBeDefined();
    expect(updateRow?.changedFields).toMatchObject({ categoryId });

    const deletedCategory = await prisma.category.findUnique({ where: { id: categoryId } });
    expect(deletedCategory).toBeNull();
  });

  it('TC-10b: reassign emits transactions.bulkRecategorized (not transaction.updated), and the cache-invalidator handler clears the affected month', async () => {
    registerCacheInvalidatorHandler();
    const { accessToken, userId } = await loginAs();
    const categoryId = await createCategoryInUse(accessToken);
    const target = await prisma.category.findFirstOrThrow({ where: { isDefault: true, type: 'expense', name: { not: 'Food' } } });
    const month = firstDayOfMonth('2026-01-15');
    await cacheSet(dashboardKey(userId, month), { seeded: true }, 60);

    let bulkPayload: { userId: string; months: string[]; fromCategoryId: number; toCategoryId: number } | undefined;
    let transactionUpdatedFired = false;
    onEvent('transactions.bulkRecategorized', (payload) => {
      bulkPayload = payload;
    });
    onEvent('transaction.updated', () => {
      transactionUpdatedFired = true;
    });

    const res = await request(app).delete(`/api/v1/categories/${categoryId}?reassignTo=${target.id}`).set(auth(accessToken));
    expect(res.status).toBe(204);

    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    expect(bulkPayload).toMatchObject({ userId, fromCategoryId: categoryId, toCategoryId: target.id, months: [month] });
    expect(transactionUpdatedFired).toBe(false); // BR fix #4: reassign never emits the real transaction.updated event.
    expect(await cacheGet(dashboardKey(userId, month))).toBeUndefined();
  });

  it('DELETE ?reassignTo=<id> pointing at a category of the wrong type is 422', async () => {
    const { accessToken } = await loginAs();
    const categoryId = await createCategoryInUse(accessToken);
    const wrongType = await prisma.category.findFirstOrThrow({ where: { isDefault: true, type: 'income' } });

    const res = await request(app)
      .delete(`/api/v1/categories/${categoryId}?reassignTo=${wrongType.id}`)
      .set(auth(accessToken));
    expect(res.status).toBe(422);
  });
});
