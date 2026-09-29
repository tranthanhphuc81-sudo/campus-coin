/**
 * admin-categories.test.ts
 * Integration tests for `/api/v1/admin/categories` against real MySQL + Redis (skipped without
 * DATABASE_URL). Covers create/list/update, name-clash 409, 404 on an unknown id, the
 * archive-vs-hard-delete BR-CA-05 branch (409 without `archive`, 200 with it, 204 when genuinely
 * unused), and that a write actually busts the (global) category-list cache a student sees.
 * Spec: docs/spec/05c §5.13 · Rules: BR-CA-01, BR-CA-05
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

const { createApp } = await import('../../../src/app.js');
const { prisma } = await import('../../../src/lib/prisma.js');
const { createActiveUser, cleanupTestUsers, flushRateLimits } = await import('../../fixtures/auth.js');
const { cleanupTestAdmins, createAdminWithTotp, loginAsAdmin } = await import('../../fixtures/admin.js');

describe.skipIf(!process.env.DATABASE_URL)('/api/v1/admin/categories', () => {
  const app = createApp();
  let adminToken: string;
  const categoryIds: number[] = [];

  beforeEach(async () => {
    await flushRateLimits();
    const admin = await createAdminWithTotp();
    adminToken = await loginAsAdmin(app, admin);
  });

  afterEach(async () => {
    // Delete test users (and their transactions) FIRST — a category left `archive`d (not deleted)
    // by a test can still be referenced by a transaction owned by a test user, which would
    // otherwise violate the category's FK before the transaction itself is gone.
    await cleanupTestAdmins();
    await cleanupTestUsers();
    if (categoryIds.length > 0) {
      await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
      categoryIds.length = 0;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  it('creates, lists and updates a system-default category', async () => {
    const create = await request(app)
      .post('/api/v1/admin/categories')
      .set(auth(adminToken))
      .send({ name: `AdminTestCat ${Date.now()}`, type: 'expense' });
    expect(create.status).toBe(201);
    expect(create.body.isDefault).toBe(true);
    categoryIds.push(create.body.id);

    const list = await request(app).get('/api/v1/admin/categories').set(auth(adminToken));
    expect(list.status).toBe(200);
    expect((list.body as Array<{ id: number }>).some((c) => c.id === create.body.id)).toBe(true);

    const update = await request(app)
      .patch(`/api/v1/admin/categories/${create.body.id}`)
      .set(auth(adminToken))
      .send({ name: `AdminTestCat Renamed ${Date.now()}` });
    expect(update.status).toBe(200);
    expect(update.body.name).toContain('Renamed');
  });

  it('PATCH updates icon/color/isActive/sortOrder together, and a rename to a name already in use is 409', async () => {
    const create = await request(app)
      .post('/api/v1/admin/categories')
      .set(auth(adminToken))
      .send({ name: `AdminTestCat2 ${Date.now()}`, type: 'expense' });
    expect(create.status).toBe(201);
    categoryIds.push(create.body.id);

    const update = await request(app)
      .patch(`/api/v1/admin/categories/${create.body.id}`)
      .set(auth(adminToken))
      .send({ icon: 'cup-hot', color: '#336699', isActive: false, sortOrder: 3 });
    expect(update.status).toBe(200);
    expect(update.body).toMatchObject({ icon: 'cup-hot', color: '#336699', isActive: false, sortOrder: 3 });

    // Renaming to the SAME name it already has must not trip the clash check against itself.
    const noOpRename = await request(app)
      .patch(`/api/v1/admin/categories/${create.body.id}`)
      .set(auth(adminToken))
      .send({ name: update.body.name });
    expect(noOpRename.status).toBe(200);

    const other = await request(app)
      .post('/api/v1/admin/categories')
      .set(auth(adminToken))
      .send({ name: `AdminTestCat3 ${Date.now()}`, type: 'expense' });
    categoryIds.push(other.body.id);

    const clash = await request(app)
      .patch(`/api/v1/admin/categories/${other.body.id}`)
      .set(auth(adminToken))
      .send({ name: update.body.name });
    expect(clash.status).toBe(409);
  });

  it('a same-type/name clash on create returns 409', async () => {
    const name = `AdminTestCat Dup ${Date.now()}`;
    const first = await request(app).post('/api/v1/admin/categories').set(auth(adminToken)).send({ name, type: 'expense' });
    categoryIds.push(first.body.id);

    const dup = await request(app).post('/api/v1/admin/categories').set(auth(adminToken)).send({ name, type: 'expense' });
    expect(dup.status).toBe(409);
  });

  it('PATCH/DELETE on an id that is not a default category returns 404', async () => {
    const patch = await request(app).patch('/api/v1/admin/categories/999999999').set(auth(adminToken)).send({ name: 'X' });
    expect(patch.status).toBe(404);

    const del = await request(app).delete('/api/v1/admin/categories/999999999').set(auth(adminToken));
    expect(del.status).toBe(404);
  });

  it('DELETE without archive on an in-use category is 409; ?archive=true archives it and busts the cache', async () => {
    const create = await request(app)
      .post('/api/v1/admin/categories')
      .set(auth(adminToken))
      .send({ name: `AdminTestCat InUse ${Date.now()}`, type: 'expense' });
    categoryIds.push(create.body.id);

    const student = await createActiveUser();
    const studentLogin = await request(app).post('/api/v1/auth/login').send({ email: student.email, password: student.password });
    const studentToken = studentLogin.body.accessToken as string;

    // Warm the student's own category-list cache before the admin write, so we can prove it busts.
    const warmed = await request(app).get('/api/v1/categories').set(auth(studentToken));
    expect((warmed.body as Array<{ name: string }>).some((c) => c.name === create.body.name)).toBe(true);

    await request(app)
      .post('/api/v1/transactions')
      .set(auth(studentToken))
      .send({ categoryId: create.body.id, type: 'expense', amount: '10.00', txnDate: '2026-01-01' });

    const blocked = await request(app).delete(`/api/v1/admin/categories/${create.body.id}`).set(auth(adminToken));
    expect(blocked.status).toBe(409);

    const archived = await request(app).delete(`/api/v1/admin/categories/${create.body.id}?archive=true`).set(auth(adminToken));
    expect(archived.status).toBe(200);
    expect(archived.body.isActive).toBe(false);

    const afterList = await request(app).get('/api/v1/categories').set(auth(studentToken));
    expect((afterList.body as Array<{ name: string }>).some((c) => c.name === create.body.name)).toBe(false);
  });

  it('DELETE without archive on a genuinely unused category hard-deletes it (204)', async () => {
    const create = await request(app)
      .post('/api/v1/admin/categories')
      .set(auth(adminToken))
      .send({ name: `AdminTestCat Unused ${Date.now()}`, type: 'expense' });

    const del = await request(app).delete(`/api/v1/admin/categories/${create.body.id}`).set(auth(adminToken));
    expect(del.status).toBe(204);

    const stillThere = await prisma.category.findUnique({ where: { id: create.body.id } });
    expect(stillThere).toBeNull();
  });

  it('Fix 7: a category still referenced by an ai_category_rules row is treated as in-use (409); archive=true still works', async () => {
    const create = await request(app)
      .post('/api/v1/admin/categories')
      .set(auth(adminToken))
      .send({ name: `AdminTestCat AiRule ${Date.now()}`, type: 'expense' });
    categoryIds.push(create.body.id);

    const student = await createActiveUser();
    await prisma.aiCategoryRule.create({
      data: { userId: student.id, merchantKey: `test-merchant-${Date.now()}`, categoryId: create.body.id },
    });

    const blocked = await request(app).delete(`/api/v1/admin/categories/${create.body.id}`).set(auth(adminToken));
    expect(blocked.status).toBe(409);

    const stillThere = await prisma.category.findUnique({ where: { id: create.body.id } });
    expect(stillThere).not.toBeNull();

    const archived = await request(app).delete(`/api/v1/admin/categories/${create.body.id}?archive=true`).set(auth(adminToken));
    expect(archived.status).toBe(200);
    expect(archived.body.isActive).toBe(false);

    await prisma.aiCategoryRule.deleteMany({ where: { categoryId: create.body.id } });
  });
});
