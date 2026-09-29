/**
 * admin-audit-logs.test.ts
 * Integration tests for `/api/v1/admin/audit-logs` against real MySQL + Redis (skipped without
 * DATABASE_URL). The router is read-only (no route accepts a body), so this only exercises the
 * query filters (`action`, `actorId`, `from`/`to`) and confirms a write from another admin router
 * (category create) produced a queryable row here.
 * Spec: docs/spec/09 §9.12 (Table 58)
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

const { createApp } = await import('../../../src/app.js');
const { prisma } = await import('../../../src/lib/prisma.js');
const { createActiveUser, cleanupTestUsers, flushRateLimits } = await import('../../fixtures/auth.js');
const { cleanupTestAdmins, createAdminWithTotp, loginAsAdmin } = await import('../../fixtures/admin.js');

describe.skipIf(!process.env.DATABASE_URL)('/api/v1/admin/audit-logs', () => {
  const app = createApp();
  let adminToken: string;
  let adminId: string;
  const categoryIds: number[] = [];

  beforeEach(async () => {
    await flushRateLimits();
    const admin = await createAdminWithTotp();
    adminId = admin.id;
    adminToken = await loginAsAdmin(app, admin);
  });

  afterEach(async () => {
    if (categoryIds.length > 0) {
      await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
      categoryIds.length = 0;
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

  it('filters by action/actorId and confirms a disable action produced a queryable row', async () => {
    const student = await createActiveUser();
    const disable = await request(app).post(`/api/v1/admin/users/${student.id}/disable`).set(auth(adminToken));
    expect(disable.status).toBe(204);

    const byAction = await request(app)
      .get('/api/v1/admin/audit-logs')
      .query({ action: 'admin.user.disable', actorId: adminId })
      .set(auth(adminToken));
    expect(byAction.status).toBe(200);
    expect(byAction.body.data.length).toBeGreaterThan(0);
    expect(
      byAction.body.data.every((r: { action: string; actorId: string }) => r.action === 'admin.user.disable' && r.actorId === adminId),
    ).toBe(true);
    expect(byAction.body.data.some((r: { entityId: string }) => r.entityId === student.id)).toBe(true);
  });

  it('with no filters at all, returns a page of rows (every filter branch is optional)', async () => {
    const student = await createActiveUser();
    await request(app).post(`/api/v1/admin/users/${student.id}/disable`).set(auth(adminToken));

    const res = await request(app).get('/api/v1/admin/audit-logs').set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('a to date in the past (no from) excludes every row', async () => {
    const student = await createActiveUser();
    await request(app).post(`/api/v1/admin/users/${student.id}/disable`).set(auth(adminToken));

    const res = await request(app)
      .get('/api/v1/admin/audit-logs')
      .query({ action: 'admin.user.disable', actorId: adminId, to: '2000-01-01T00:00:00Z' })
      .set(auth(adminToken));

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(0);
  });

  it('a from date in the far future excludes every row (date-range filter works)', async () => {
    const student = await createActiveUser();
    await request(app).post(`/api/v1/admin/users/${student.id}/disable`).set(auth(adminToken));

    const res = await request(app)
      .get('/api/v1/admin/audit-logs')
      .query({ action: 'admin.user.disable', actorId: adminId, from: '2099-01-01T00:00:00Z' })
      .set(auth(adminToken));

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(0);
  });

  it('a category-create write from the admin-categories router is queryable here too', async () => {
    const create = await request(app)
      .post('/api/v1/admin/categories')
      .set(auth(adminToken))
      .send({ name: `AuditCheck ${Date.now()}`, type: 'expense' });
    categoryIds.push(create.body.id);

    const res = await request(app)
      .get('/api/v1/admin/audit-logs')
      .query({ action: 'admin.category.create', actorId: adminId })
      .set(auth(adminToken));

    expect(res.status).toBe(200);
    expect(res.body.data.some((r: { entityId: string }) => r.entityId === String(create.body.id))).toBe(true);
  });

  it('Fix 8: a "toEmail" in a row\'s metadata comes back masked, never in the clear', async () => {
    const rawToEmail = 'recipient@example.com';
    await prisma.auditLog.create({
      data: {
        actorId: adminId,
        actorRole: 'admin',
        action: 'reports.monthly.share',
        metadata: { toEmail: rawToEmail, month: '2026-09' },
      },
    });

    const res = await request(app)
      .get('/api/v1/admin/audit-logs')
      .query({ action: 'reports.monthly.share', actorId: adminId })
      .set(auth(adminToken));

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    const row = res.body.data[0] as { metadata: { toEmail: string; month: string } };
    expect(row.metadata.toEmail).not.toBe(rawToEmail);
    expect(row.metadata.toEmail).toMatch(/\*\*\*/);
    // Every other metadata field is untouched.
    expect(row.metadata.month).toBe('2026-09');
  });
});
