/**
 * admin-stats.test.ts
 * Integration tests for `/api/v1/admin/stats` against real MySQL + Redis (skipped without
 * DATABASE_URL). Hand-verifies the arithmetic: `usersByStatus` via a before/after delta on known
 * created accounts, `aiAcceptanceRate` against the same accepted/(accepted+overridden) ratio
 * computed directly from the DB, and the k-anonymity suppression (a category used by only 2
 * distinct users must be entirely absent from `categories-usage`).
 * Spec: docs/spec/05c §5.13 (Table 24)
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { CategorySource, SYSTEM_OWNER_KEY } from '@campuscoin/shared';

const { createApp } = await import('../../../src/app.js');
const { prisma } = await import('../../../src/lib/prisma.js');
const { hashPassword } = await import('../../../src/lib/password.js');
const { createActiveUser, cleanupTestUsers, flushRateLimits, trackUserForCleanup, uniqueEmail, STRONG_PASSWORD } =
  await import('../../fixtures/auth.js');
const { cleanupTestAdmins, createAdminWithTotp, loginAsAdmin } = await import('../../fixtures/admin.js');

describe.skipIf(!process.env.DATABASE_URL)('/api/v1/admin/stats', () => {
  const app = createApp();
  let adminToken: string;
  const extraCategoryIds: number[] = [];

  beforeEach(async () => {
    await flushRateLimits();
    const admin = await createAdminWithTotp();
    adminToken = await loginAsAdmin(app, admin);
  });

  afterEach(async () => {
    if (extraCategoryIds.length > 0) {
      await prisma.transaction.deleteMany({ where: { categoryId: { in: extraCategoryIds } } });
      await prisma.category.deleteMany({ where: { id: { in: extraCategoryIds } } });
      extraCategoryIds.length = 0;
    }
    await cleanupTestAdmins();
    await cleanupTestUsers();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  it('usersByStatus reflects a known delta of newly created active/pending/disabled accounts', async () => {
    const before = await request(app).get('/api/v1/admin/stats/overview').set(auth(adminToken));
    const baseline = before.body.usersByStatus;

    await createActiveUser();
    await createActiveUser();
    const passwordHash = await hashPassword(STRONG_PASSWORD);
    const pendingUser = await prisma.user.create({
      data: { email: uniqueEmail(), passwordHash, fullName: 'Pending Stats', status: 'pending' },
    });
    trackUserForCleanup(pendingUser.id);
    const disabledUser = await prisma.user.create({
      data: { email: uniqueEmail(), passwordHash, fullName: 'Disabled Stats', status: 'disabled' },
    });
    trackUserForCleanup(disabledUser.id);

    const after = await request(app).get('/api/v1/admin/stats/overview').set(auth(adminToken));
    const stats = after.body.usersByStatus;

    expect(stats.active).toBe(baseline.active + 2);
    expect(stats.pending).toBe(baseline.pending + 1);
    expect(stats.disabled).toBe(baseline.disabled + 1);
  });

  it('aiAcceptanceRate matches accepted/(accepted+overridden) computed directly from the DB', async () => {
    const student = await createActiveUser();
    const category = await prisma.category.findFirstOrThrow({ where: { ownerKey: SYSTEM_OWNER_KEY, type: 'expense' } });

    await prisma.transaction.create({
      data: {
        userId: student.id,
        categoryId: category.id,
        type: 'expense',
        amount: '5.00',
        currency: 'USD',
        txnDate: new Date('2026-01-01'),
        categorySource: CategorySource.AI_ACCEPTED,
      },
    });
    await prisma.transaction.create({
      data: {
        userId: student.id,
        categoryId: category.id,
        type: 'expense',
        amount: '5.00',
        currency: 'USD',
        txnDate: new Date('2026-01-01'),
        categorySource: CategorySource.AI_OVERRIDDEN,
      },
    });

    const [accepted, overridden] = await Promise.all([
      prisma.transaction.count({ where: { deletedAt: null, categorySource: CategorySource.AI_ACCEPTED } }),
      prisma.transaction.count({ where: { deletedAt: null, categorySource: CategorySource.AI_OVERRIDDEN } }),
    ]);
    const expectedRate = Math.round((accepted / (accepted + overridden)) * 10000) / 10000;

    const res = await request(app).get('/api/v1/admin/stats/overview').set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.aiAcceptanceRate).toBeCloseTo(expectedRate, 4);
  });

  it('k-anonymity: a default category used by only 2 distinct users is omitted from categories-usage', async () => {
    const category = await request(app)
      .post('/api/v1/admin/categories')
      .set(auth(adminToken))
      .send({ name: `KAnon ${Date.now()}`, type: 'expense' });
    extraCategoryIds.push(category.body.id);

    const studentA = await createActiveUser();
    const studentB = await createActiveUser();
    for (const student of [studentA, studentB]) {
      await prisma.transaction.create({
        data: {
          userId: student.id,
          categoryId: category.body.id,
          type: 'expense',
          amount: '5.00',
          currency: 'USD',
          txnDate: new Date('2026-01-01'),
        },
      });
    }

    const res = await request(app).get('/api/v1/admin/stats/categories-usage').set(auth(adminToken));
    expect(res.status).toBe(200);
    expect((res.body as Array<{ categoryId: number }>).some((c) => c.categoryId === category.body.id)).toBe(false);
  });
});
