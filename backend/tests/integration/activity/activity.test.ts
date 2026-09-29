/**
 * activity.test.ts
 * Integration tests for the recent-activity feature (docs/spec/05c §5.14) against real MySQL +
 * Redis (skipped without DATABASE_URL): `GET /transactions/:id` records `viewed`, `PATCH` records
 * `edited`, the list stays capped at RECENT_ACTIVITY_MAX_PER_USER (newest-first), a soft-deleted
 * transaction's activity is hidden, and another user's activity never appears (cross-tenant).
 * Spec: docs/spec/05c §5.14
 */
import { RECENT_ACTIVITY_MAX_PER_USER } from '@campuscoin/shared';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

const { createApp } = await import('../../../src/app.js');
const { prisma } = await import('../../../src/lib/prisma.js');
const { createActiveUser, cleanupTestUsers, flushRateLimits } = await import('../../fixtures/auth.js');

describe.skipIf(!process.env.DATABASE_URL)('/api/v1/activity', () => {
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

  function getDefaultCategory(type: 'income' | 'expense') {
    return prisma.category.findFirstOrThrow({ where: { isDefault: true, type } });
  }

  it('GET records a "viewed" row and PATCH records an "edited" row, deduped to one row per transaction', async () => {
    const { accessToken } = await loginAs();
    const category = await getDefaultCategory('expense');
    const create = await request(app)
      .post('/api/v1/transactions')
      .set(auth(accessToken))
      .send({ type: 'expense', categoryId: category.id, amount: '5.00', txnDate: '2026-01-05' });
    const id = create.body.id as string;

    const get = await request(app).get(`/api/v1/transactions/${id}`).set(auth(accessToken));
    expect(get.status).toBe(200);

    let list = await request(app).get('/api/v1/activity/recent').set(auth(accessToken));
    expect(list.status).toBe(200);
    expect(list.body.data[0]).toMatchObject({ transactionId: id, action: 'viewed' });

    const patch = await request(app)
      .patch(`/api/v1/transactions/${id}`)
      .set(auth(accessToken))
      .send({ amount: '6.00', version: 1 });
    expect(patch.status).toBe(200);

    list = await request(app).get('/api/v1/activity/recent').set(auth(accessToken));
    const rowsForId = (list.body.data as Array<{ transactionId: string; action: string }>).filter((r) => r.transactionId === id);
    expect(rowsForId).toHaveLength(1); // deduped: still exactly one row for this transaction.
    expect(rowsForId[0]?.action).toBe('edited');
  });

  it('keeps only the newest RECENT_ACTIVITY_MAX_PER_USER rows after viewing more distinct transactions', async () => {
    const { accessToken } = await loginAs();
    const category = await getDefaultCategory('expense');
    const total = RECENT_ACTIVITY_MAX_PER_USER + 1;
    const ids: string[] = [];

    for (let i = 0; i < total; i += 1) {
      const create = await request(app)
        .post('/api/v1/transactions')
        .set(auth(accessToken))
        .send({ type: 'expense', categoryId: category.id, amount: '1.00', txnDate: '2026-01-05' });
      const id = create.body.id as string;
      ids.push(id);
      const get = await request(app).get(`/api/v1/transactions/${id}`).set(auth(accessToken));
      expect(get.status).toBe(200);
    }

    const list = await request(app)
      .get(`/api/v1/activity/recent?limit=${RECENT_ACTIVITY_MAX_PER_USER}`)
      .set(auth(accessToken));
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(RECENT_ACTIVITY_MAX_PER_USER);

    const returnedIds = (list.body.data as Array<{ transactionId: string }>).map((r) => r.transactionId);
    expect(returnedIds).not.toContain(ids[0]); // the very first one viewed fell out of the cap.
    expect(returnedIds[0]).toBe(ids[ids.length - 1]); // newest first.
  }, 30_000);

  it('hides a soft-deleted transaction from the recent-activity list', async () => {
    const { accessToken } = await loginAs();
    const category = await getDefaultCategory('expense');
    const create = await request(app)
      .post('/api/v1/transactions')
      .set(auth(accessToken))
      .send({ type: 'expense', categoryId: category.id, amount: '5.00', txnDate: '2026-01-05' });
    const id = create.body.id as string;
    await request(app).get(`/api/v1/transactions/${id}`).set(auth(accessToken));

    const del = await request(app).delete(`/api/v1/transactions/${id}`).set(auth(accessToken));
    expect(del.status).toBe(204);

    const list = await request(app).get('/api/v1/activity/recent').set(auth(accessToken));
    expect(list.status).toBe(200);
    expect((list.body.data as Array<{ transactionId: string }>).some((r) => r.transactionId === id)).toBe(false);
  });

  it("cross-tenant: another user's activity never appears", async () => {
    const userA = await loginAs();
    const userB = await loginAs();
    const category = await getDefaultCategory('expense');
    const create = await request(app)
      .post('/api/v1/transactions')
      .set(auth(userA.accessToken))
      .send({ type: 'expense', categoryId: category.id, amount: '5.00', txnDate: '2026-01-05' });
    const id = create.body.id as string;
    await request(app).get(`/api/v1/transactions/${id}`).set(auth(userA.accessToken));

    const list = await request(app).get('/api/v1/activity/recent').set(auth(userB.accessToken));
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(0);
  });
});
