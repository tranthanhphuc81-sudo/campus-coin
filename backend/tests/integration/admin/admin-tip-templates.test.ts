/**
 * admin-tip-templates.test.ts
 * Integration tests for `/api/v1/admin/tip-templates` against real MySQL + Redis (skipped without
 * DATABASE_URL). Covers CRUD, `code` uniqueness 409, an invalid `{secret}` placeholder 422, the
 * preview endpoint rendering fixed sample text, and delete being blocked while a `UserTip` still
 * references the template.
 * Spec: docs/spec/05b §5.10 · docs/spec/05c §5.13
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

const { createApp } = await import('../../../src/app.js');
const { prisma } = await import('../../../src/lib/prisma.js');
const { createActiveUser, cleanupTestUsers, flushRateLimits } = await import('../../fixtures/auth.js');
const { cleanupTestAdmins, createAdminWithTotp, loginAsAdmin } = await import('../../fixtures/admin.js');

describe.skipIf(!process.env.DATABASE_URL)('/api/v1/admin/tip-templates', () => {
  const app = createApp();
  let adminToken: string;
  let adminId: string;
  const templateIds: number[] = [];

  beforeEach(async () => {
    await flushRateLimits();
    const admin = await createAdminWithTotp();
    adminId = admin.id;
    adminToken = await loginAsAdmin(app, admin);
  });

  afterEach(async () => {
    if (templateIds.length > 0) {
      await prisma.userTip.deleteMany({ where: { templateId: { in: templateIds } } });
      await prisma.tipTemplate.deleteMany({ where: { id: { in: templateIds } } });
      templateIds.length = 0;
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

  it('creates, lists, updates and deletes a tip template', async () => {
    const code = `TEST_${Date.now()}`;
    const create = await request(app).post('/api/v1/admin/tip-templates').set(auth(adminToken)).send({
      code,
      ruleType: 'general',
      titleTpl: 'Save on {category}',
      bodyTpl: 'You spent {amount} ({percent}%).',
    });
    expect(create.status).toBe(201);
    expect(create.body.isActive).toBe(true);
    templateIds.push(create.body.id);

    // Fix 9: action codes renamed to `admin.template.*` (spec Table 58's own naming), not `admin.tip_template.*`.
    const createAudit = await prisma.auditLog.findFirst({
      where: { actorId: adminId, action: 'admin.template.create', entityId: String(create.body.id) },
    });
    expect(createAudit).not.toBeNull();

    const list = await request(app).get('/api/v1/admin/tip-templates').set(auth(adminToken));
    expect(list.status).toBe(200);
    expect((list.body as Array<{ code: string }>).some((t) => t.code === code)).toBe(true);

    const update = await request(app)
      .patch(`/api/v1/admin/tip-templates/${create.body.id}`)
      .set(auth(adminToken))
      .send({ titleTpl: 'Updated {category} tip' });
    expect(update.status).toBe(200);
    expect(update.body.titleTpl).toBe('Updated {category} tip');
    const updateAudit = await prisma.auditLog.findFirst({
      where: { actorId: adminId, action: 'admin.template.update', entityId: String(create.body.id) },
    });
    expect(updateAudit).not.toBeNull();

    const del = await request(app).delete(`/api/v1/admin/tip-templates/${create.body.id}`).set(auth(adminToken));
    expect(del.status).toBe(204);
    templateIds.length = 0;
    const deleteAudit = await prisma.auditLog.findFirst({
      where: { actorId: adminId, action: 'admin.template.delete', entityId: String(create.body.id) },
    });
    expect(deleteAudit).not.toBeNull();
  });

  it('code uniqueness clash returns 409', async () => {
    const code = `TEST_DUP_${Date.now()}`;
    const first = await request(app)
      .post('/api/v1/admin/tip-templates')
      .set(auth(adminToken))
      .send({ code, ruleType: 'general', titleTpl: 'A', bodyTpl: 'B' });
    templateIds.push(first.body.id);

    const dup = await request(app)
      .post('/api/v1/admin/tip-templates')
      .set(auth(adminToken))
      .send({ code, ruleType: 'general', titleTpl: 'C', bodyTpl: 'D' });
    expect(dup.status).toBe(409);
  });

  it('an out-of-whitelist {secret} placeholder is rejected with 422', async () => {
    const res = await request(app)
      .post('/api/v1/admin/tip-templates')
      .set(auth(adminToken))
      .send({ code: `TEST_BAD_${Date.now()}`, ruleType: 'general', titleTpl: 'Leak {secret}', bodyTpl: 'Body' });
    expect(res.status).toBe(422);
  });

  it('the preview endpoint renders fixed sample values without touching the DB', async () => {
    const res = await request(app)
      .post('/api/v1/admin/tip-templates/preview')
      .set(auth(adminToken))
      .send({ titleTpl: 'Save on {category}', bodyTpl: 'You spent {amount} ({percent}%).' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ title: 'Save on Food', body: 'You spent 25.00 (80%).' });
  });

  it('delete is blocked with 409 while a UserTip references the template; deactivating via PATCH still works', async () => {
    const code = `TEST_INUSE_${Date.now()}`;
    const create = await request(app)
      .post('/api/v1/admin/tip-templates')
      .set(auth(adminToken))
      .send({ code, ruleType: 'general', titleTpl: 'A', bodyTpl: 'B' });
    templateIds.push(create.body.id);

    const student = await createActiveUser();
    await prisma.userTip.create({
      data: {
        userId: student.id,
        templateId: create.body.id,
        categoryId: null,
        period: new Date('2026-09-01'),
        renderedTitle: 'A',
        renderedBody: 'B',
        impactAmount: '10.00',
        score: '1.0000',
        status: 'active',
      },
    });

    const del = await request(app).delete(`/api/v1/admin/tip-templates/${create.body.id}`).set(auth(adminToken));
    expect(del.status).toBe(409);

    const deactivate = await request(app)
      .patch(`/api/v1/admin/tip-templates/${create.body.id}`)
      .set(auth(adminToken))
      .send({ isActive: false });
    expect(deactivate.status).toBe(200);
    expect(deactivate.body.isActive).toBe(false);
  });
});
