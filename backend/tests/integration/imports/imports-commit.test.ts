/**
 * imports-commit.test.ts
 * Integration tests for `POST /imports/:id/commit` against real MySQL + Redis (skipped without
 * DATABASE_URL): the happy path (source/importBatchId/history/audit), exactly one aggregated
 * `transactions.imported` event (never one `transaction.created` per row), `Idempotency-Key`
 * replay, a keyless second commit attempt (409), atomic rollback on a forced mid-transaction
 * failure, and committing against a since-archived category (422, nothing written).
 * Spec: docs/spec/05a §5.5 · docs/spec/07 §7.1 (Table 40 – idempotency) · Rules: BR-TX-06
 */
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type * as TransactionsCoreModule from '../../../src/modules/transactions/transactions.core.js';

const { createApp } = await import('../../../src/app.js');
const { prisma } = await import('../../../src/lib/prisma.js');
const { createActiveUser, cleanupTestUsers, flushRateLimits } = await import('../../fixtures/auth.js');
const importsService = await import('../../../src/modules/imports/imports.service.js');
const { on: onEvent, _resetForTests: resetEventBus } = await import('../../../src/events/bus.js');

/** Polls `check` until it resolves true, or throws after `timeoutMs` (events fire on `setImmediate`). */
async function waitFor(check: () => boolean, timeoutMs = 2000, intervalMs = 25): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    if (check()) return;
    if (Date.now() >= deadline) throw new Error('waitFor: condition never became true');
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

describe.skipIf(!process.env.DATABASE_URL)('POST /api/v1/imports/:id/commit', () => {
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

  async function loginAs(): Promise<{ userId: string; accessToken: string }> {
    const user = await createActiveUser();
    const res = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: user.password });
    return { userId: user.id, accessToken: res.body.accessToken as string };
  }

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  async function uploadAndParse(accessToken: string, userId: string, content: string, filename = 'file.csv'): Promise<string> {
    const upload = await request(app)
      .post('/api/v1/imports')
      .set(auth(accessToken))
      .attach('file', Buffer.from(content, 'utf8'), { filename, contentType: 'text/csv' });
    expect(upload.status).toBe(202);
    const batchId = upload.body.batchId as string;
    await importsService.parseBatch({ batchId, userId, rev: 0 });
    return batchId;
  }

  it('happy path: writes selected rows with source csv_import + importBatchId + history, one audit row, and exactly one transactions.imported event', async () => {
    const { accessToken, userId } = await loginAs();
    const csv = 'date,amount,type,description,category\n2024-01-10,4.50,expense,Coffee run,Food\n2024-01-11,6.00,expense,Bus fare,Transport\n';
    const batchId = await uploadAndParse(accessToken, userId, csv, 'happy.csv');

    const importedEvents: unknown[] = [];
    const createdEvents: unknown[] = [];
    onEvent('transactions.imported', (payload) => {
      importedEvents.push(payload);
    });
    onEvent('transaction.created', (payload) => {
      createdEvents.push(payload);
    });

    const res = await request(app).post(`/api/v1/imports/${batchId}/commit`).set(auth(accessToken));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ committedRows: 2, errorRows: 0, skippedRows: 0, errorReportUrl: null });

    const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: batchId } });
    expect(batch).toMatchObject({ status: 'committed', committedRows: 2 });

    const txns = await prisma.transaction.findMany({ where: { userId, importBatchId: batchId }, orderBy: { txnDate: 'asc' } });
    expect(txns).toHaveLength(2);
    for (const txn of txns) {
      expect(txn.source).toBe('csv_import');
      expect(txn.importBatchId).toBe(batchId);
      const history = await prisma.transactionHistory.findMany({ where: { transactionId: txn.id } });
      expect(history).toHaveLength(1);
      expect(history[0]!.action).toBe('create');
    }

    const audit = await prisma.auditLog.findFirst({ where: { action: 'import.committed', entityId: batchId } });
    expect(audit).not.toBeNull();
    expect(audit!.actorId).toBe(userId);

    await waitFor(() => importedEvents.length === 1);
    expect(importedEvents).toHaveLength(1);
    expect(createdEvents).toHaveLength(0);
  });

  it('replaying the same Idempotency-Key returns the identical cached response and writes nothing twice', async () => {
    const { accessToken, userId } = await loginAs();
    const csv = 'date,amount,type,description,category\n2024-01-12,3.25,expense,Snack,Food\n';
    const batchId = await uploadAndParse(accessToken, userId, csv, 'idem.csv');
    const key = randomUUID();

    const first = await request(app).post(`/api/v1/imports/${batchId}/commit`).set(auth(accessToken)).set('Idempotency-Key', key);
    expect(first.status).toBe(200);

    const second = await request(app).post(`/api/v1/imports/${batchId}/commit`).set(auth(accessToken)).set('Idempotency-Key', key);
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);

    const txnCount = await prisma.transaction.count({ where: { userId, importBatchId: batchId } });
    expect(txnCount).toBe(1);
  });

  it('a second commit attempt with no/different Idempotency-Key on an already-committed batch is rejected (409)', async () => {
    const { accessToken, userId } = await loginAs();
    const csv = 'date,amount,type,description,category\n2024-01-13,9.00,expense,Lunch,Food\n';
    const batchId = await uploadAndParse(accessToken, userId, csv, 'keyless.csv');

    const first = await request(app).post(`/api/v1/imports/${batchId}/commit`).set(auth(accessToken));
    expect(first.status).toBe(200);

    const second = await request(app).post(`/api/v1/imports/${batchId}/commit`).set(auth(accessToken));
    expect(second.status).toBe(409);

    const txnCount = await prisma.transaction.count({ where: { userId, importBatchId: batchId } });
    expect(txnCount).toBe(1);
  });

  it('atomic commit: a failure inside the DB transaction writes nothing and leaves the batch previewed', async () => {
    const { accessToken, userId } = await loginAs();
    const csv = 'date,amount,type,description,category\n2024-01-14,8.00,expense,Atomic test row,Food\n';
    const batchId = await uploadAndParse(accessToken, userId, csv, 'atomic.csv');

    vi.resetModules();
    vi.doMock('../../../src/modules/transactions/transactions.core.js', async () => {
      const actual = await vi.importActual<typeof TransactionsCoreModule>('../../../src/modules/transactions/transactions.core.js');
      return { ...actual, insertImportedTransactions: vi.fn().mockRejectedValue(new Error('forced failure for atomicity test')) };
    });

    try {
      const { createApp: createAppWithMock } = await import('../../../src/app.js');
      const mockedApp = createAppWithMock();

      const res = await request(mockedApp).post(`/api/v1/imports/${batchId}/commit`).set(auth(accessToken));
      expect(res.status).toBeGreaterThanOrEqual(500);
    } finally {
      vi.doUnmock('../../../src/modules/transactions/transactions.core.js');
      vi.resetModules();
    }

    const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: batchId } });
    expect(batch.status).toBe('previewed');
    const txnCount = await prisma.transaction.count({ where: { userId, importBatchId: batchId } });
    expect(txnCount).toBe(0);
  });

  it('committing against a since-archived category fails (422) and writes nothing', async () => {
    const { accessToken, userId } = await loginAs();
    const custom = await request(app).post('/api/v1/categories').set(auth(accessToken)).send({ name: 'Soon Archived', type: 'expense' });
    expect(custom.status).toBe(201);

    const csv = `date,amount,type,description,category\n2024-01-15,2.00,expense,Row against a doomed category,${custom.body.name}\n`;
    const batchId = await uploadAndParse(accessToken, userId, csv, 'archived-category.csv');

    await prisma.category.update({ where: { id: custom.body.id }, data: { isActive: false } });

    const res = await request(app).post(`/api/v1/imports/${batchId}/commit`).set(auth(accessToken));
    expect(res.status).toBe(422);

    const txnCount = await prisma.transaction.count({ where: { userId, importBatchId: batchId } });
    expect(txnCount).toBe(0);
    const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: batchId } });
    expect(batch.status).toBe('previewed');
  });

  it('rejects committing with nothing selected (422)', async () => {
    const { accessToken, userId } = await loginAs();
    const csv = 'date,amount,type,description,category\n2024-01-16,2.00,expense,Will be deselected,Food\n';
    const batchId = await uploadAndParse(accessToken, userId, csv, 'none-selected.csv');

    await request(app).patch(`/api/v1/imports/${batchId}/rows`).set(auth(accessToken)).send({ setAllSelected: false }).expect(200);

    const res = await request(app).post(`/api/v1/imports/${batchId}/commit`).set(auth(accessToken));
    expect(res.status).toBe(422);
  });
});
