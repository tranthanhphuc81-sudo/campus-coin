/**
 * duplicate.test.ts
 * Integration test for TC-25 (duplicate detector, docs/spec/05c §5.14): of two near-identical
 * transactions created close together, only the newer (second) one is flagged
 * `isPossibleDuplicate`, and its notification carries the original's id as `duplicateOfId`.
 * Skipped without DATABASE_URL.
 * Spec: docs/spec/05c §5.14 · TC-25
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

describe.skipIf(!process.env.DATABASE_URL)('Duplicate detector (TC-25)', () => {
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

  it('flags only the second of two near-identical transactions, with duplicateOfId pointing at the first', async () => {
    const { userId, accessToken } = await loginAs();
    const category = await prisma.category.findFirstOrThrow({ where: { isDefault: true, type: 'expense' } });

    const first = await request(app)
      .post('/api/v1/transactions')
      .set(auth(accessToken))
      .send({ type: 'expense', categoryId: category.id, amount: '20.00', txnDate: '2026-01-05', description: 'Coffee' });
    expect(first.status).toBe(201);
    const firstId = first.body.id as string;

    const second = await request(app)
      .post('/api/v1/transactions')
      .set(auth(accessToken))
      .send({ type: 'expense', categoryId: category.id, amount: '20.00', txnDate: '2026-01-05', description: 'Coffee' });
    expect(second.status).toBe(201);
    const secondId = second.body.id as string;

    await waitFor(async () => {
      const txn = await prisma.transaction.findUniqueOrThrow({ where: { id: secondId } });
      return txn.isPossibleDuplicate === true;
    });

    const firstAfter = await prisma.transaction.findUniqueOrThrow({ where: { id: firstId } });
    expect(firstAfter.isPossibleDuplicate).toBe(false);

    const raised = await prisma.notification.findMany({ where: { userId, dedupeKey: `duplicate:${secondId}` } });
    expect(raised).toHaveLength(1);
    expect(raised[0]?.type).toBe('duplicate');
    expect(raised[0]?.payload).toMatchObject({ transactionId: secondId, duplicateOfId: firstId });
  }, 20_000);
});
