/**
 * imports-upload.test.ts
 * Integration tests for `POST /imports` against real MySQL + Redis (skipped without
 * DATABASE_URL). Covers TC-18 (oversized/binary/wrong-extension/wrong-MIME rejection, each
 * leaving zero trace), an empty file (422), same-file dedupe (409), re-upload after discard
 * (202), the open-batches cap (B-M3, 409 on the 4th open batch), and the 10/hour rate limit (429).
 * Spec: docs/spec/09 §9.10 (file safety) · docs/spec/07 §7.4 (Table 46)
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

const { createApp } = await import('../../../src/app.js');
const { prisma } = await import('../../../src/lib/prisma.js');
const { redis } = await import('../../../src/lib/redis.js');
const { createActiveUser, cleanupTestUsers, flushRateLimits } = await import('../../fixtures/auth.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(__dirname, '../../fixtures/csv');
const validCsv = readFileSync(path.join(FIXTURES_DIR, 'valid-200.csv'));
const binaryCsv = readFileSync(path.join(FIXTURES_DIR, 'binary.csv'));

describe.skipIf(!process.env.DATABASE_URL)('POST /api/v1/imports', () => {
  const app = createApp();

  beforeEach(async () => {
    await flushRateLimits();
    const importRateKeys = await redis.keys('rl:imports-create:*');
    if (importRateKeys.length > 0) await redis.del(...importRateKeys);
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

  async function countBatches(userId: string): Promise<number> {
    return prisma.importBatch.count({ where: { userId } });
  }

  it('TC-18: a file over 2MB is rejected (413) and leaves no batch behind', async () => {
    const { accessToken, userId } = await loginAs();
    const oversized = Buffer.alloc(2_200_000, 'a');

    const res = await request(app)
      .post('/api/v1/imports')
      .set(auth(accessToken))
      .attach('file', oversized, { filename: 'huge.csv', contentType: 'text/csv' });

    expect(res.status).toBe(413);
    expect(await countBatches(userId)).toBe(0);
  });

  it('TC-18: a binary file renamed to .csv is rejected (415) and leaves no batch behind', async () => {
    const { accessToken, userId } = await loginAs();

    const res = await request(app)
      .post('/api/v1/imports')
      .set(auth(accessToken))
      .attach('file', binaryCsv, { filename: 'renamed.csv', contentType: 'text/csv' });

    expect(res.status).toBe(415);
    expect(await countBatches(userId)).toBe(0);
  });

  it('TC-18: a non-.csv extension is rejected (415)', async () => {
    const { accessToken, userId } = await loginAs();

    const res = await request(app)
      .post('/api/v1/imports')
      .set(auth(accessToken))
      .attach('file', validCsv, { filename: 'export.txt', contentType: 'text/csv' });

    expect(res.status).toBe(415);
    expect(await countBatches(userId)).toBe(0);
  });

  it('TC-18: an unsupported MIME type is rejected (415)', async () => {
    const { accessToken, userId } = await loginAs();

    const res = await request(app)
      .post('/api/v1/imports')
      .set(auth(accessToken))
      .attach('file', validCsv, { filename: 'data.csv', contentType: 'application/pdf' });

    expect(res.status).toBe(415);
    expect(await countBatches(userId)).toBe(0);
  });

  it('rejects an empty file (422)', async () => {
    const { accessToken, userId } = await loginAs();

    const res = await request(app)
      .post('/api/v1/imports')
      .set(auth(accessToken))
      .attach('file', Buffer.alloc(0), { filename: 'empty.csv', contentType: 'text/csv' });

    expect(res.status).toBe(422);
    expect(await countBatches(userId)).toBe(0);
  });

  it('accepts a valid CSV (202) and creates one uploaded batch', async () => {
    const { accessToken, userId } = await loginAs();

    const res = await request(app)
      .post('/api/v1/imports')
      .set(auth(accessToken))
      .attach('file', validCsv, { filename: 'valid-200.csv', contentType: 'text/csv' });

    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ status: 'uploaded' });
    expect(typeof res.body.batchId).toBe('string');
    expect(await countBatches(userId)).toBe(1);
  });

  it('rejects re-uploading the identical file while the first import is still active (409)', async () => {
    const { accessToken } = await loginAs();
    const first = await request(app)
      .post('/api/v1/imports')
      .set(auth(accessToken))
      .attach('file', validCsv, { filename: 'valid-200.csv', contentType: 'text/csv' });
    expect(first.status).toBe(202);

    const second = await request(app)
      .post('/api/v1/imports')
      .set(auth(accessToken))
      .attach('file', validCsv, { filename: 'valid-200.csv', contentType: 'text/csv' });
    expect(second.status).toBe(409);
  });

  it('allows re-uploading the same file after the batch was discarded', async () => {
    const { accessToken } = await loginAs();
    const first = await request(app)
      .post('/api/v1/imports')
      .set(auth(accessToken))
      .attach('file', validCsv, { filename: 'valid-200.csv', contentType: 'text/csv' });
    expect(first.status).toBe(202);

    await request(app).delete(`/api/v1/imports/${first.body.batchId}`).set(auth(accessToken)).expect(204);

    const second = await request(app)
      .post('/api/v1/imports')
      .set(auth(accessToken))
      .attach('file', validCsv, { filename: 'valid-200.csv', contentType: 'text/csv' });
    expect(second.status).toBe(202);
  });

  it('B-M3: a 4th open batch is rejected (409); committing/discarding one frees a slot for the next upload', async () => {
    const { accessToken } = await loginAs();
    /** A distinct single-row CSV per call, so the file-hash dedupe (409) never masks the cap check. */
    function distinctCsv(tag: string): Buffer {
      return Buffer.from(`date,amount,type,description,category\n2024-01-01,4.50,expense,${tag},Food\n`, 'utf8');
    }

    const batchIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .post('/api/v1/imports')
        .set(auth(accessToken))
        .attach('file', distinctCsv(`open-${i}`), { filename: `open-${i}.csv`, contentType: 'text/csv' });
      expect(res.status).toBe(202);
      batchIds.push(res.body.batchId as string);
    }

    const fourth = await request(app)
      .post('/api/v1/imports')
      .set(auth(accessToken))
      .attach('file', distinctCsv('open-3'), { filename: 'open-3.csv', contentType: 'text/csv' });
    expect(fourth.status).toBe(409);

    // Discarding one of the three open batches frees a slot for the next upload.
    await request(app).delete(`/api/v1/imports/${batchIds[0]}`).set(auth(accessToken)).expect(204);

    const afterDiscard = await request(app)
      .post('/api/v1/imports')
      .set(auth(accessToken))
      .attach('file', distinctCsv('open-4'), { filename: 'open-4.csv', contentType: 'text/csv' });
    expect(afterDiscard.status).toBe(202);
  });

  it('TC-18/Table 46: an 11th upload within an hour is rate-limited (429)', async () => {
    const { accessToken } = await loginAs();
    const tinyCsv = Buffer.from('date,amount,type,description,category\n2024-01-01,4.50,expense,Coffee,Food\n', 'utf8');

    let last;
    for (let i = 0; i < 11; i++) {
      last = await request(app)
        .post('/api/v1/imports')
        .set(auth(accessToken))
        .attach('file', tinyCsv, { filename: 'tiny.csv', contentType: 'text/csv' });
    }

    expect(last!.status).toBe(429);
  });
});
