/**
 * notifications.test.ts
 * Integration tests for `/api/v1/notifications` against real MySQL + Redis (skipped without
 * DATABASE_URL). Covers list/read/read-all, the SSE stream-ticket lifecycle (single-use,
 * expired), and TC-20: the budget-alert domain-event handler raising/clearing `budget_near`/
 * `budget_exceeded` notifications as consumption crosses thresholds, including the
 * duplicate-event no-op case.
 * Spec: docs/spec/05c §5.11 (notifications, budget alerts) · docs/spec/07 §7.3.3 · TC-20
 */
import http from 'node:http';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

const { createApp } = await import('../../../src/app.js');
const { prisma } = await import('../../../src/lib/prisma.js');
const { createActiveUser, cleanupTestUsers, flushRateLimits } = await import('../../fixtures/auth.js');
const { firstDayOfMonth, todayInTimeZone } = await import('../../../src/lib/dates.js');
const { _resetForTests: resetEventBus } = await import('../../../src/events/bus.js');
const { registerBudgetAlertHandler } = await import('../../../src/events/handlers/budget-alert.handler.js');
const notificationsService = await import('../../../src/modules/notifications/notifications.service.js');
const { redis } = await import('../../../src/lib/redis.js');

/** Polls `check` until it resolves true, or throws after `timeoutMs` (async domain-event handlers run off-request). */
async function waitFor(check: () => Promise<boolean>, timeoutMs = 3000, intervalMs = 50): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    if (await check()) return;
    if (Date.now() >= deadline) throw new Error('waitFor: condition never became true');
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

describe.skipIf(!process.env.DATABASE_URL)('/api/v1/notifications', () => {
  const app = createApp();
  const month = firstDayOfMonth(todayInTimeZone('Asia/Ho_Chi_Minh'));

  beforeEach(async () => {
    await flushRateLimits();
    registerBudgetAlertHandler(); // re-registered fresh after the previous test's resetEventBus()
  });

  afterEach(async () => {
    resetEventBus();
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

  function getDefaultCategory(type: 'income' | 'expense', name?: string) {
    return prisma.category.findFirstOrThrow({ where: { isDefault: true, type, ...(name ? { name } : {}) } });
  }

  async function notificationsOf(userId: string) {
    return prisma.notification.findMany({ where: { userId } });
  }

  it('TC-20: budget_near then budget_exceeded fire once each, clear when spend drops, and resend on re-crossing', async () => {
    const { userId, accessToken } = await loginAs();
    const food = await getDefaultCategory('expense', 'Food');

    await request(app)
      .put('/api/v1/budgets')
      .set(auth(accessToken))
      .send({ month, budgets: [{ categoryId: food.id, limitAmount: '30.00', alertThresholdPct: 80 }] });

    const txn1 = await request(app)
      .post('/api/v1/transactions')
      .set(auth(accessToken))
      .send({ type: 'expense', categoryId: food.id, amount: '26.00', txnDate: month });
    expect(txn1.status).toBe(201);
    const txn1Id = txn1.body.id as string;

    await waitFor(async () => (await notificationsOf(userId)).some((n) => n.dedupeKey.endsWith(':near')));
    let rows = await notificationsOf(userId);
    expect(rows.filter((n) => n.dedupeKey.endsWith(':near'))).toHaveLength(1);
    expect(rows.some((n) => n.dedupeKey.endsWith(':exceeded'))).toBe(false);

    const txn2 = await request(app)
      .post('/api/v1/transactions')
      .set(auth(accessToken))
      .send({ type: 'expense', categoryId: food.id, amount: '10.00', txnDate: month }); // total 36 -> 120%
    expect(txn2.status).toBe(201);
    const txn2Id = txn2.body.id as string;

    await waitFor(async () => (await notificationsOf(userId)).some((n) => n.dedupeKey.endsWith(':exceeded')));
    rows = await notificationsOf(userId);
    expect(rows.filter((n) => n.dedupeKey.endsWith(':exceeded'))).toHaveLength(1);

    // Drop back under 80% (delete both transactions -> 0 spent) — both alerts must be cleared.
    await request(app).delete(`/api/v1/transactions/${txn1Id}`).set(auth(accessToken));
    await request(app).delete(`/api/v1/transactions/${txn2Id}`).set(auth(accessToken));

    await waitFor(async () => (await notificationsOf(userId)).length === 0);
    rows = await notificationsOf(userId);
    expect(rows).toHaveLength(0);

    // Re-crossing 80% must raise a NEW budget_near — the unique constraint must not block a resend.
    const txn3 = await request(app)
      .post('/api/v1/transactions')
      .set(auth(accessToken))
      .send({ type: 'expense', categoryId: food.id, amount: '26.00', txnDate: month });
    expect(txn3.status).toBe(201);

    await waitFor(async () => (await notificationsOf(userId)).some((n) => n.dedupeKey.endsWith(':near')));
    rows = await notificationsOf(userId);
    expect(rows.filter((n) => n.dedupeKey.endsWith(':near'))).toHaveLength(1);
  }, 15_000);

  it('duplicate events for the same net consumption state are a no-op (still one row per dedupeKey)', async () => {
    const { userId, accessToken } = await loginAs();
    const food = await getDefaultCategory('expense', 'Food');

    await request(app)
      .put('/api/v1/budgets')
      .set(auth(accessToken))
      .send({ month, budgets: [{ categoryId: food.id, limitAmount: '30.00', alertThresholdPct: 80 }] });

    const txn1 = await request(app)
      .post('/api/v1/transactions')
      .set(auth(accessToken))
      .send({ type: 'expense', categoryId: food.id, amount: '26.00', txnDate: month });
    expect(txn1.status).toBe(201);

    await waitFor(async () => (await notificationsOf(userId)).some((n) => n.dedupeKey.endsWith(':near')));

    // A second transaction that stays within the same 80-99% band re-fires the same dedupeKey —
    // notify() must treat the resulting UNIQUE(userId, dedupeKey) violation as a no-op.
    const txn2 = await request(app)
      .post('/api/v1/transactions')
      .set(auth(accessToken))
      .send({ type: 'expense', categoryId: food.id, amount: '0.50', txnDate: month }); // 26.50/30 = 88% (still amber)
    expect(txn2.status).toBe(201);

    await new Promise((resolve) => setTimeout(resolve, 300));
    const rows = await notificationsOf(userId);
    expect(rows.filter((n) => n.dedupeKey.endsWith(':near'))).toHaveLength(1);
  }, 15_000);

  it('GET /notifications lists with a fresh unread count; POST /:id/read and /read-all mark them read', async () => {
    const { userId, accessToken } = await loginAs();
    const created = await notificationsService.notify(userId, {
      type: 'system',
      title: 'Welcome',
      body: 'Thanks for joining CampusCoin.',
      dedupeKey: `test:${userId}:welcome`,
    });
    expect(created).not.toBeNull();

    const list = await request(app).get('/api/v1/notifications').set(auth(accessToken));
    expect(list.status).toBe(200);
    expect(list.body.unreadCount).toBeGreaterThanOrEqual(1);
    expect((list.body.data as Array<{ id: string }>).some((n) => n.id === created!.id)).toBe(true);

    const read = await request(app).post(`/api/v1/notifications/${created!.id}/read`).set(auth(accessToken));
    expect(read.status).toBe(200);
    expect(read.body.readAt).not.toBeNull();

    const readAll = await request(app).post('/api/v1/notifications/read-all').set(auth(accessToken));
    expect(readAll.status).toBe(204);

    const afterReadAll = await prisma.notification.findMany({ where: { userId, readAt: null } });
    expect(afterReadAll).toHaveLength(0);
  });

  it('POST /:id/read on another user\'s notification is 404 (not 403)', async () => {
    const userA = await loginAs();
    const userB = await loginAs();
    const created = await notificationsService.notify(userA.userId, {
      type: 'system',
      title: 'Private',
      dedupeKey: `test:${userA.userId}:private`,
    });

    const res = await request(app).post(`/api/v1/notifications/${created!.id}/read`).set(auth(userB.accessToken));
    expect(res.status).toBe(404);
  });

  it('POST /stream-ticket then GET /stream: a valid ticket opens an SSE feed that receives a published notification', async () => {
    const { userId, accessToken } = await loginAs();
    const ticketRes = await request(app).post('/api/v1/notifications/stream-ticket').set(auth(accessToken));
    expect(ticketRes.status).toBe(201);
    const ticket = ticketRes.body.ticket as string;

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    const chunks: string[] = [];
    const clientReq = http.get(`http://127.0.0.1:${port}/api/v1/notifications/stream?ticket=${ticket}`, (res) => {
      res.on('data', (chunk: Buffer) => chunks.push(chunk.toString('utf8')));
    });

    try {
      // Give the server a moment to subscribe before publishing.
      await new Promise((resolve) => setTimeout(resolve, 200));
      await notificationsService.notify(userId, { type: 'system', title: 'Stream test', dedupeKey: `test:${userId}:stream` });

      await waitFor(async () => chunks.join('').includes('Stream test'), 3000, 50);
      expect(chunks.join('')).toContain('data: ');
    } finally {
      clientReq.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 10_000);

  it('a used stream ticket is rejected on a second use (401)', async () => {
    const { accessToken } = await loginAs();
    const ticketRes = await request(app).post('/api/v1/notifications/stream-ticket').set(auth(accessToken));
    const ticket = ticketRes.body.ticket as string;

    // Consume the ticket once at the service level (equivalent to one real GET /stream connection).
    const first = await notificationsService.consumeStreamTicket(ticket);
    expect(first).not.toBeNull();

    const second = await request(app).get('/api/v1/notifications/stream').query({ ticket });
    expect(second.status).toBe(401);
  });

  it('an expired stream ticket is rejected (401)', async () => {
    const { accessToken } = await loginAs();
    const ticketRes = await request(app).post('/api/v1/notifications/stream-ticket').set(auth(accessToken));
    const ticket = ticketRes.body.ticket as string;

    await redis.pexpire(`stream-ticket:${ticket}`, 1);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const res = await request(app).get('/api/v1/notifications/stream').query({ ticket });
    expect(res.status).toBe(401);
  });

  it('GET /stream without a ticket is 401', async () => {
    const res = await request(app).get('/api/v1/notifications/stream');
    expect(res.status).toBe(401);
  });
});
