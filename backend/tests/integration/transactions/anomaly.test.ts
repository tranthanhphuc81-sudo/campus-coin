/**
 * anomaly.test.ts
 * Integration test for TC-24 (anomaly detector, docs/spec/05c §5.14): a new expense far above its
 * category's recent peers gets `isAnomaly` flipped true (against real MySQL + Redis, skipped
 * without DATABASE_URL), raises a `anomaly:<id>`-dedup-keyed notification, and appends a `SYSTEM`
 * history row.
 * Spec: docs/spec/05c §5.14 · TC-24
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

const { createApp } = await import('../../../src/app.js');
const { prisma } = await import('../../../src/lib/prisma.js');
const { createActiveUser, cleanupTestUsers, flushRateLimits } = await import('../../fixtures/auth.js');
const { _resetForTests: resetEventBus } = await import('../../../src/events/bus.js');
const { registerAnomalyDetectorHandler } = await import('../../../src/events/handlers/anomaly-detector.handler.js');

/** Polls `check` until it resolves true, or throws after `timeoutMs` (the handler runs off-request). */
async function waitFor(check: () => Promise<boolean>, timeoutMs = 5000, intervalMs = 50): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    if (await check()) return;
    if (Date.now() >= deadline) throw new Error('waitFor: condition never became true');
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

describe.skipIf(!process.env.DATABASE_URL)('Anomaly detector (TC-24)', () => {
  const app = createApp();

  beforeEach(async () => {
    await flushRateLimits();
    registerAnomalyDetectorHandler(); // re-registered fresh after the previous test's resetEventBus()
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

  it('flags a new expense far above its category peers, notifies, and appends a SYSTEM history row', async () => {
    const { userId, accessToken } = await loginAs();
    const category = await prisma.category.findFirstOrThrow({ where: { isDefault: true, type: 'expense' } });

    // Allowance baseline set generously enough that 500.00 still clears the 20% allowance gate.
    await prisma.user.update({ where: { id: userId }, data: { monthlyAllowanceBaseline: '1000.00' } });

    // 5 peer expenses of 10.00 each in the same category, well within the trailing 90-day window.
    for (let i = 0; i < 5; i += 1) {
      const peer = await request(app)
        .post('/api/v1/transactions')
        .set(auth(accessToken))
        .send({ type: 'expense', categoryId: category.id, amount: '10.00', txnDate: '2026-01-01' });
      expect(peer.status).toBe(201);
    }

    const anomalous = await request(app)
      .post('/api/v1/transactions')
      .set(auth(accessToken))
      .send({ type: 'expense', categoryId: category.id, amount: '500.00', txnDate: '2026-01-05' });
    expect(anomalous.status).toBe(201);
    const id = anomalous.body.id as string;

    await waitFor(async () => {
      const txn = await prisma.transaction.findUniqueOrThrow({ where: { id } });
      return txn.isAnomaly === true;
    });

    const raised = await prisma.notification.findMany({ where: { userId, dedupeKey: `anomaly:${id}` } });
    expect(raised).toHaveLength(1);
    expect(raised[0]?.type).toBe('anomaly');

    const history = await prisma.transactionHistory.findMany({ where: { transactionId: id }, orderBy: { changedAt: 'asc' } });
    const systemRow = history.find((h) => h.changedBy === 'SYSTEM');
    expect(systemRow).toBeDefined();
    expect(systemRow?.action).toBe('update');
  }, 20_000);

  it('does not flag an expense that stays within its category peers\' normal range', async () => {
    const { userId, accessToken } = await loginAs();
    const category = await prisma.category.findFirstOrThrow({ where: { isDefault: true, type: 'expense' } });

    for (let i = 0; i < 5; i += 1) {
      const peer = await request(app)
        .post('/api/v1/transactions')
        .set(auth(accessToken))
        .send({ type: 'expense', categoryId: category.id, amount: '10.00', txnDate: '2026-01-01' });
      expect(peer.status).toBe(201);
    }

    const normal = await request(app)
      .post('/api/v1/transactions')
      .set(auth(accessToken))
      .send({ type: 'expense', categoryId: category.id, amount: '12.00', txnDate: '2026-01-05' });
    expect(normal.status).toBe(201);
    const id = normal.body.id as string;

    // Give the (async, off-request) detector a moment to run, then assert it never flagged this one.
    await new Promise((resolve) => setTimeout(resolve, 300));
    const txn = await prisma.transaction.findUniqueOrThrow({ where: { id } });
    expect(txn.isAnomaly).toBe(false);
    const raised = await prisma.notification.findMany({ where: { userId, dedupeKey: `anomaly:${id}` } });
    expect(raised).toHaveLength(0);
  });
});
