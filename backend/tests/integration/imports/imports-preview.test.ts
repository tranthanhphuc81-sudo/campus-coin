/**
 * imports-preview.test.ts
 * Integration tests for the parse/preview stage of the CSV import wizard against real MySQL +
 * Redis (skipped without DATABASE_URL): `import.parse`'s row counts and per-row errors,
 * duplicate detection (DB + intra-file), category resolution (CSV name match, AI, and the
 * Miscellaneous/Other Income fallback), `PATCH /imports/:id/rows` (category/selection edits and
 * an options change that triggers a re-parse while preserving earlier overrides), and
 * filter/pagination on `GET /imports/:id`. `import.parse` is invoked directly (no worker process
 * runs in tests), mirroring how `recurring-materialize.test.ts` calls its processor's business
 * logic directly.
 * Spec: docs/spec/05a §5.5 · Rules: BR-TX-01, BR-TX-02
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { AiProvider, CategorizeRequest, CategorizeResultItem } from '../../../src/integrations/ai/index.js';

const { createApp } = await import('../../../src/app.js');
const { prisma } = await import('../../../src/lib/prisma.js');
const { redis } = await import('../../../src/lib/redis.js');
const { createActiveUser, cleanupTestUsers, flushRateLimits } = await import('../../fixtures/auth.js');
const importsService = await import('../../../src/modules/imports/imports.service.js');
const { _setAiProviderForTests } = await import('../../../src/integrations/ai/index.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(__dirname, '../../fixtures/csv');
const validCsv = readFileSync(path.join(FIXTURES_DIR, 'valid-200.csv'));
const invalidCsv = readFileSync(path.join(FIXTURES_DIR, 'invalid.csv'));

/** Letters-only random word — `normalizeMerchantKey` strips digits, and this must miss the tier-2 keyword dictionary. */
function uniqueWord(): string {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  let out = '';
  for (let i = 0; i < 16; i++) out += letters[Math.floor(Math.random() * letters.length)];
  return out;
}

describe.skipIf(!process.env.DATABASE_URL)('CSV import preview (parse, GET, PATCH rows)', () => {
  const app = createApp();

  beforeEach(async () => {
    await flushRateLimits();
    const importRateKeys = await redis.keys('rl:imports-create:*');
    if (importRateKeys.length > 0) await redis.del(...importRateKeys);
  });

  afterEach(async () => {
    _setAiProviderForTests(null);
    await cleanupTestUsers();
    const aiKeys = await redis.keys('ai:*');
    if (aiKeys.length > 0) await redis.del(...aiKeys);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function loginAs(overrides: Partial<{ aiOptIn: boolean }> = {}): Promise<{ userId: string; accessToken: string }> {
    const user = await createActiveUser();
    if (overrides.aiOptIn !== undefined) {
      await prisma.user.update({ where: { id: user.id }, data: { aiOptIn: overrides.aiOptIn } });
    }
    const res = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: user.password });
    return { userId: user.id, accessToken: res.body.accessToken as string };
  }

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  async function uploadAndParse(accessToken: string, userId: string, content: Buffer, filename = 'file.csv'): Promise<string> {
    const upload = await request(app).post('/api/v1/imports').set(auth(accessToken)).attach('file', content, { filename, contentType: 'text/csv' });
    expect(upload.status).toBe(202);
    const batchId = upload.body.batchId as string;
    await importsService.parseBatch({ batchId, userId, rev: 0 });
    return batchId;
  }

  it('valid-200.csv: 200/200 valid rows, no errors', async () => {
    const { accessToken, userId } = await loginAs();
    const batchId = await uploadAndParse(accessToken, userId, validCsv, 'valid-200.csv');

    const res = await request(app).get(`/api/v1/imports/${batchId}`).set(auth(accessToken));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'previewed', totalRows: 200, validRows: 200, errorRows: 0 });
  });

  it('invalid.csv: per-row errors and an intra-file duplicate', async () => {
    const { accessToken, userId } = await loginAs();
    const batchId = await uploadAndParse(accessToken, userId, invalidCsv, 'invalid.csv');

    const res = await request(app).get(`/api/v1/imports/${batchId}`).set(auth(accessToken));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'previewed', totalRows: 6, validRows: 2, errorRows: 4, duplicateRows: 1 });

    const errors = await request(app).get(`/api/v1/imports/${batchId}?filter=errors`).set(auth(accessToken));
    expect(errors.body.rows.data).toHaveLength(4);
    expect((errors.body.rows.data as { errors: unknown[] }[]).every((r) => r.errors.length > 0)).toBe(true);

    const duplicates = await request(app).get(`/api/v1/imports/${batchId}?filter=duplicates`).set(auth(accessToken));
    expect(duplicates.body.rows.data).toHaveLength(1);
    expect(duplicates.body.rows.data[0]).toMatchObject({ isDuplicate: true, selected: false });
  });

  it('B-L3: a malformed CSV (unterminated quote) fails with a fixed generic message, never csv-parse\'s raw error text', async () => {
    const { accessToken, userId } = await loginAs();
    const malformed = Buffer.from('date,amount,type,description,category\n"unterminated quote,4.50,expense,Coffee,Food\n', 'utf8');
    const batchId = await uploadAndParse(accessToken, userId, malformed, 'malformed.csv');

    const res = await request(app).get(`/api/v1/imports/${batchId}`).set(auth(accessToken));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('failed');
    expect(res.body.failure).toEqual({ code: 'malformed-csv', message: 'Could not parse this file as CSV.' });
  });

  it('detects a duplicate against an existing transaction, not just within the file', async () => {
    const { accessToken, userId } = await loginAs();
    const food = await prisma.category.findFirstOrThrow({ where: { isDefault: true, type: 'expense', name: 'Food' } });
    await prisma.transaction.create({
      data: { userId, categoryId: food.id, type: 'expense', amount: '9.99', currency: 'USD', description: 'Existing lunch', txnDate: new Date('2024-03-01'), source: 'manual', categorySource: 'user' },
    });

    const csv = Buffer.from('date,amount,type,description,category\n2024-03-01,9.99,expense,Existing lunch,Food\n', 'utf8');
    const batchId = await uploadAndParse(accessToken, userId, csv, 'dup.csv');

    const res = await request(app).get(`/api/v1/imports/${batchId}`).set(auth(accessToken));
    expect(res.body.rows.data[0]).toMatchObject({ isDuplicate: true, selected: false });
  });

  it('a blank category with no AI provider falls back to Miscellaneous and flags needsReview', async () => {
    const { accessToken, userId } = await loginAs();
    const description = uniqueWord();
    const csv = Buffer.from(`date,amount,type,description,category\n2024-01-05,3.00,expense,${description},\n`, 'utf8');
    const batchId = await uploadAndParse(accessToken, userId, csv, 'blank-category.csv');

    const res = await request(app).get(`/api/v1/imports/${batchId}`).set(auth(accessToken));
    expect(res.body.rows.data[0]).toMatchObject({ categoryName: 'Miscellaneous', categoryOrigin: 'fallback', needsReview: true });
  });

  it('a blank category resolved by a stubbed AI provider is categoryOrigin "ai"', async () => {
    const { accessToken, userId } = await loginAs({ aiOptIn: true });
    const description = uniqueWord();
    const entertainment = await prisma.category.findFirstOrThrow({ where: { isDefault: true, type: 'expense', name: 'Entertainment' } });

    const categorize = vi.fn(async (req: CategorizeRequest): Promise<CategorizeResultItem[]> => req.items.map((item) => ({ index: item.index, category: 'Entertainment', confidence: 0.8 })));
    const provider: AiProvider = { name: 'spy', enabled: true, categorize, writeInsight: async () => null };
    _setAiProviderForTests(provider);

    const csv = Buffer.from(`date,amount,type,description,category\n2024-01-06,15.00,expense,${description},\n`, 'utf8');
    const batchId = await uploadAndParse(accessToken, userId, csv, 'ai-category.csv');

    const res = await request(app).get(`/api/v1/imports/${batchId}`).set(auth(accessToken));
    expect(res.body.rows.data[0]).toMatchObject({ categoryId: entertainment.id, categoryOrigin: 'ai', aiSuggestedCategoryId: entertainment.id });
  });

  it('PATCH .../rows changes a row\'s category and toggles selection', async () => {
    const { accessToken, userId } = await loginAs();
    const csv = Buffer.from('date,amount,type,description,category\n2024-01-07,5.00,expense,Unassigned spend,\n', 'utf8');
    const batchId = await uploadAndParse(accessToken, userId, csv, 'patch.csv');
    const transport = await prisma.category.findFirstOrThrow({ where: { isDefault: true, type: 'expense', name: 'Transport' } });

    const patch = await request(app)
      .patch(`/api/v1/imports/${batchId}/rows`)
      .set(auth(accessToken))
      .send({ rows: [{ rowNumber: 2, categoryId: transport.id, selected: false }] });
    expect(patch.status).toBe(200);

    const res = await request(app).get(`/api/v1/imports/${batchId}`).set(auth(accessToken));
    expect(res.body.rows.data[0]).toMatchObject({ categoryId: transport.id, categoryName: 'Transport', categoryOrigin: 'user', selected: false });
  });

  it('B-L5: PATCH .../rows rejects a categoryId of the wrong type (batched lookup still enforces per-row type)', async () => {
    const { accessToken, userId } = await loginAs();
    const csv = Buffer.from('date,amount,type,description,category\n2024-01-07,5.00,expense,Unassigned spend,\n', 'utf8');
    const batchId = await uploadAndParse(accessToken, userId, csv, 'wrong-type.csv');
    const incomeCategory = await prisma.category.findFirstOrThrow({ where: { isDefault: true, type: 'income' } });

    const patch = await request(app)
      .patch(`/api/v1/imports/${batchId}/rows`)
      .set(auth(accessToken))
      .send({ rows: [{ rowNumber: 2, categoryId: incomeCategory.id }] });
    expect(patch.status).toBe(422);
  });

  it('rejects selecting a row that still has errors (422)', async () => {
    const { accessToken, userId } = await loginAs();
    const csv = Buffer.from('date,amount,type,description,category\n2024-01-08,not-a-number,expense,Broken row,Food\n', 'utf8');
    const batchId = await uploadAndParse(accessToken, userId, csv, 'error-row.csv');

    const patch = await request(app).patch(`/api/v1/imports/${batchId}/rows`).set(auth(accessToken)).send({ rows: [{ rowNumber: 2, selected: true }] });
    expect(patch.status).toBe(422);
  });

  it('PATCH .../rows with a new dateFormat triggers a re-parse (202) and preserves earlier overrides', async () => {
    const { accessToken, userId } = await loginAs();
    // "03/04/2024" is genuinely ambiguous; the batch-level default (no unambiguous evidence) is DMY -> 2024-04-03.
    const csv = Buffer.from('date,amount,type,description,category\n03/04/2024,7.50,expense,Ambiguous date row,Food\n', 'utf8');
    const batchId = await uploadAndParse(accessToken, userId, csv, 'ambiguous-date.csv');

    const before = await request(app).get(`/api/v1/imports/${batchId}`).set(auth(accessToken));
    expect(before.body.rows.data[0].txnDate).toBe('2024-04-03');

    // Deselect the row before changing the date format, to prove the override survives the re-parse.
    await request(app).patch(`/api/v1/imports/${batchId}/rows`).set(auth(accessToken)).send({ rows: [{ rowNumber: 2, selected: false }] }).expect(200);

    const patch = await request(app).patch(`/api/v1/imports/${batchId}/rows`).set(auth(accessToken)).send({ options: { dateFormat: 'MM/DD/YYYY' } });
    expect(patch.status).toBe(202);
    expect(patch.body.status).toBe('parsing');

    await importsService.parseBatch({ batchId, userId, rev: 1 });

    const after = await request(app).get(`/api/v1/imports/${batchId}`).set(auth(accessToken));
    expect(after.body.status).toBe('previewed');
    expect(after.body.rows.data[0]).toMatchObject({ txnDate: '2024-03-04', selected: false });
  });

  it('paginates the preview', async () => {
    const { accessToken, userId } = await loginAs();
    const batchId = await uploadAndParse(accessToken, userId, validCsv, 'valid-200.csv');

    const page1 = await request(app).get(`/api/v1/imports/${batchId}?page=1&limit=50`).set(auth(accessToken));
    expect(page1.body.rows.data).toHaveLength(50);
    expect(page1.body.rows.meta).toMatchObject({ page: 1, limit: 50, total: 200, totalPages: 4 });

    const page4 = await request(app).get(`/api/v1/imports/${batchId}?page=4&limit=50`).set(auth(accessToken));
    expect(page4.body.rows.data).toHaveLength(50);
  });

  it('B-L8: rejects an absurd ?page= with a 422, not a 500', async () => {
    const { accessToken, userId } = await loginAs();
    const batchId = await uploadAndParse(accessToken, userId, validCsv, 'valid-200.csv');

    const res = await request(app).get(`/api/v1/imports/${batchId}?page=999999999`).set(auth(accessToken));
    expect(res.status).toBe(422);
  });
});
