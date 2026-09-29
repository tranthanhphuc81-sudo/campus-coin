/**
 * export.test.ts
 * Integration tests for `GET /api/v1/me/export` against real MySQL + Redis (skipped without
 * DATABASE_URL). Covers the JSON format (headers, no secret/cross-tenant leakage, `user.export`
 * audit row), the CSV/ZIP format (magic bytes + entry name), the 3/day rate limit, role/validation
 * rejections, and `buildTransactionsCsv`'s formula-injection neutralisation.
 * Spec: docs/spec/09 §9.14 (data portability) · docs/spec/09 §9.10 (TC-19 CSV safety)
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

const { createApp } = await import('../../../src/app.js');
const { prisma } = await import('../../../src/lib/prisma.js');
const { redis } = await import('../../../src/lib/redis.js');
const { createActiveUser, cleanupTestUsers } = await import('../../fixtures/auth.js');
const { createAdminWithTotp, loginAsAdmin, cleanupTestAdmins } = await import('../../fixtures/admin.js');
const { buildTransactionsCsv } = await import('../../../src/modules/privacy/privacy.export.js');
const { toDbDate } = await import('../../../src/lib/dates.js');

/** Keys that must never appear anywhere in the export, regardless of nesting depth. */
const FORBIDDEN_KEY_PATTERN = /passwordHash|mfaSecretEnc|mfaRecoveryCodes|tokenHash|refreshToken/i;
/** A bare 64-hex-char string looks exactly like a SHA-256 token hash. */
const HEX64_PATTERN = /^[0-9a-f]{64}$/i;

/** Recursively walks a JSON-like value, failing the assertion if any forbidden key/hash-looking value is found. */
function assertNoSecrets(value: unknown, path = '$'): void {
  if (value === null || value === undefined) return;
  if (typeof value === 'string') {
    expect(HEX64_PATTERN.test(value), `hash-like string at ${path}: "${value}"`).toBe(false);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoSecrets(v, `${path}[${i}]`));
    return;
  }
  if (typeof value === 'object') {
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      expect(FORBIDDEN_KEY_PATTERN.test(key), `forbidden key at ${path}.${key}`).toBe(false);
      assertNoSecrets(v, `${path}.${key}`);
    }
  }
}

describe.skipIf(!process.env.DATABASE_URL)('GET /api/v1/me/export', () => {
  const app = createApp();

  beforeEach(async () => {
    const keys = await redis.keys('rl:me-export:*');
    if (keys.length > 0) await redis.del(...keys);
  });

  afterEach(async () => {
    await cleanupTestUsers();
    await cleanupTestAdmins();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function loginAs() {
    const user = await createActiveUser();
    const login = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: user.password });
    return { user, accessToken: login.body.accessToken as string };
  }

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  async function seedFullAccount(userId: string) {
    const category = await prisma.category.create({
      data: { userId, ownerKey: userId, name: `Coffee-${Date.now()}`, type: 'expense', isDefault: false },
    });
    await prisma.transaction.create({
      data: {
        userId,
        categoryId: category.id,
        type: 'expense',
        amount: '4.50',
        currency: 'USD',
        description: 'Campus Cafe',
        txnDate: toDbDate('2026-01-05'),
      },
    });
    // A soft-deleted transaction — the export must include it too (full data dump).
    await prisma.transaction.create({
      data: {
        userId,
        categoryId: category.id,
        type: 'expense',
        amount: '2.00',
        currency: 'USD',
        description: 'Deleted item',
        txnDate: toDbDate('2026-01-06'),
        deletedAt: new Date(),
      },
    });
    await prisma.budget.create({ data: { userId, categoryId: category.id, month: toDbDate('2026-01-01'), limitAmount: '100.00' } });
    await prisma.recurringRule.create({
      data: {
        userId,
        categoryId: category.id,
        type: 'expense',
        amount: '9.99',
        frequency: 'monthly',
        dayOfMonth: 1,
        startDate: toDbDate('2026-01-01'),
        nextRunDate: toDbDate('2026-02-01'),
      },
    });
    await prisma.bookmark.create({ data: { userId, targetType: 'tip', targetRef: '123', note: 'remember this' } });
    await prisma.importBatch.create({
      data: { userId, originalFilename: 'export-test.csv', fileSha256: `sha-${userId}`, status: 'committed', totalRows: 1, validRows: 1 },
    });
    // A second, ACTUALLY-committed batch (committedAt set) — exercises the "committedAt present"
    // branch of the export's own `committedAt ? ... : null` mapping (the batch above leaves it null).
    await prisma.importBatch.create({
      data: {
        userId,
        originalFilename: 'export-test-2.csv',
        fileSha256: `sha2-${userId}`,
        status: 'committed',
        totalRows: 1,
        validRows: 1,
        committedAt: new Date(),
      },
    });
    await prisma.aiCategoryRule.create({ data: { userId, merchantKey: 'campus cafe', categoryId: category.id } });
    return category;
  }

  it('format=json: 200, correct headers, full data (incl. soft-deleted txn) with no secrets/cross-tenant leakage, writes user.export audit row', async () => {
    const { user, accessToken } = await loginAs();
    const other = await createActiveUser();
    await seedFullAccount(user.id);
    await seedFullAccount(other.id); // must never appear in `user`'s export.

    const res = await request(app).get('/api/v1/me/export').set(auth(accessToken));

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="campuscoin-export-\d{4}-\d{2}-\d{2}\.json"/);

    assertNoSecrets(res.body);
    expect(res.body.user.email).toBe(user.email);
    expect(res.body.transactions).toHaveLength(2);
    expect(res.body.transactions.some((t: { deletedAt: string | null }) => t.deletedAt !== null)).toBe(true);
    expect(res.body.categories).toHaveLength(1);
    expect(res.body.budgets).toHaveLength(1);
    expect(res.body.recurringRules).toHaveLength(1);
    expect(res.body.bookmarks).toHaveLength(1);
    expect(res.body.importBatches).toHaveLength(2);
    expect(res.body.importBatches.some((b: { committedAt: string | null }) => b.committedAt !== null)).toBe(true);
    expect(res.body.importBatches.some((b: { committedAt: string | null }) => b.committedAt === null)).toBe(true);
    expect(res.body.aiCategoryRules).toHaveLength(1);
    // Cross-tenant: none of the other user's row ids leak in.
    const otherTxns = await prisma.transaction.findMany({ where: { userId: other.id } });
    const exportedIds = new Set(res.body.transactions.map((t: { id: string }) => t.id));
    for (const t of otherTxns) expect(exportedIds.has(t.id)).toBe(false);

    const auditRow = await prisma.auditLog.findFirst({ where: { actorId: user.id, action: 'user.export' } });
    expect(auditRow).not.toBeNull();
    expect((auditRow!.metadata as { format?: string } | null)?.format).toBe('json');
  });

  it('format=csv: 200, application/zip, valid ZIP (PK magic bytes) containing a transactions.csv entry', async () => {
    const { user, accessToken } = await loginAs();
    await seedFullAccount(user.id);

    const res = await request(app)
      .get('/api/v1/me/export')
      .query({ format: 'csv' })
      .set(auth(accessToken))
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/zip');
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="campuscoin-export-\d{4}-\d{2}-\d{2}\.zip"/);

    const buf = res.body as Buffer;
    expect(buf.subarray(0, 2).toString('latin1')).toBe('PK'); // ZIP local file header magic.
    expect(buf.toString('latin1')).toContain('transactions.csv');
  });

  it('4th call in a day is 429 (3/day limit)', async () => {
    const { accessToken } = await loginAs();
    for (let i = 0; i < 3; i++) {
      const res = await request(app).get('/api/v1/me/export').set(auth(accessToken));
      expect(res.status).toBe(200);
    }
    const fourth = await request(app).get('/api/v1/me/export').set(auth(accessToken));
    expect(fourth.status).toBe(429);
  });

  it('an admin token is 403 (student-only route)', async () => {
    const admin = await createAdminWithTotp();
    const adminToken = await loginAsAdmin(app, admin);
    const res = await request(app).get('/api/v1/me/export').set(auth(adminToken));
    expect(res.status).toBe(403);
  });

  it('an invalid format value is 422', async () => {
    const { accessToken } = await loginAs();
    const res = await request(app).get('/api/v1/me/export').query({ format: 'xml' }).set(auth(accessToken));
    expect(res.status).toBe(422);
  });

  it('no token is 401', async () => {
    const res = await request(app).get('/api/v1/me/export');
    expect(res.status).toBe(401);
  });
});

describe('buildTransactionsCsv (TC-19 formula-injection neutralisation)', () => {
  it('neutralises a leading =/+/-/@ in the description before RFC-4180 escaping', () => {
    const csv = buildTransactionsCsv([
      {
        id: 't1',
        type: 'expense',
        categoryId: 1,
        category: { id: 1, name: 'Food', type: 'expense', icon: null, color: null },
        amount: '5.00',
        currency: 'USD',
        description: '=SUM(A1:A9)',
        txnDate: '2026-01-05',
        source: 'manual',
        recurringRuleId: null,
        recurringPeriod: null,
        categorySource: 'user',
        aiSuggestedCategoryId: null,
        aiConfidence: null,
        isAnomaly: false,
        isPossibleDuplicate: false,
        version: 1,
        deletedAt: null,
        createdAt: '2026-01-05T00:00:00.000Z',
        updatedAt: '2026-01-05T00:00:00.000Z',
      },
    ]);

    expect(csv).toContain("'=SUM(A1:A9)");
  });
});
