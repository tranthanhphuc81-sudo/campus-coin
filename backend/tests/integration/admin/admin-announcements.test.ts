/**
 * admin-announcements.test.ts
 * Integration tests for `/api/v1/admin/announcements` against real MySQL + Redis (skipped without
 * DATABASE_URL). Covers CRUD and validation (title/body length, `<script>` HTML-filtering, 422).
 * Spec: docs/spec/05c §5.13
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

const { createApp } = await import('../../../src/app.js');
const { prisma } = await import('../../../src/lib/prisma.js');
const { flushRateLimits } = await import('../../fixtures/auth.js');
const { cleanupTestAdmins, createAdminWithTotp, loginAsAdmin } = await import('../../fixtures/admin.js');

describe.skipIf(!process.env.DATABASE_URL)('/api/v1/admin/announcements', () => {
  const app = createApp();
  let adminToken: string;
  const announcementIds: number[] = [];

  beforeEach(async () => {
    await flushRateLimits();
    const admin = await createAdminWithTotp();
    adminToken = await loginAsAdmin(app, admin);
  });

  afterEach(async () => {
    if (announcementIds.length > 0) {
      await prisma.announcement.deleteMany({ where: { id: { in: announcementIds } } });
      announcementIds.length = 0;
    }
    await cleanupTestAdmins();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  it('creates, lists, updates and deletes an announcement', async () => {
    const create = await request(app).post('/api/v1/admin/announcements').set(auth(adminToken)).send({
      title: 'Maintenance window',
      body: 'The app will be briefly unavailable.',
      level: 'info',
      startsAt: '2026-10-01T00:00:00Z',
    });
    expect(create.status).toBe(201);
    expect(create.body.isActive).toBe(true);
    announcementIds.push(create.body.id);

    const list = await request(app).get('/api/v1/admin/announcements').set(auth(adminToken));
    expect(list.status).toBe(200);
    expect((list.body as Array<{ id: number }>).some((a) => a.id === create.body.id)).toBe(true);

    const update = await request(app)
      .patch(`/api/v1/admin/announcements/${create.body.id}`)
      .set(auth(adminToken))
      .send({ isActive: false });
    expect(update.status).toBe(200);
    expect(update.body.isActive).toBe(false);

    const del = await request(app).delete(`/api/v1/admin/announcements/${create.body.id}`).set(auth(adminToken));
    expect(del.status).toBe(204);
    announcementIds.length = 0;
  });

  it('creates with an endsAt, then PATCHes every field at once', async () => {
    const create = await request(app).post('/api/v1/admin/announcements').set(auth(adminToken)).send({
      title: 'Scheduled maintenance',
      body: 'Downtime expected.',
      level: 'warning',
      startsAt: '2026-10-01T00:00:00Z',
      endsAt: '2026-10-02T00:00:00Z',
    });
    expect(create.status).toBe(201);
    announcementIds.push(create.body.id);

    const update = await request(app)
      .patch(`/api/v1/admin/announcements/${create.body.id}`)
      .set(auth(adminToken))
      .send({
        title: 'Updated title',
        body: 'Updated body.',
        level: 'info',
        startsAt: '2026-11-01T00:00:00Z',
        endsAt: '2026-11-02T00:00:00Z',
        isActive: true,
      });
    expect(update.status).toBe(200);
    expect(update.body).toMatchObject({ title: 'Updated title', body: 'Updated body.', level: 'info', isActive: true });

    // Clearing endsAt (explicit null) is a distinct branch from setting it to a date.
    const clearEndsAt = await request(app).patch(`/api/v1/admin/announcements/${create.body.id}`).set(auth(adminToken)).send({ endsAt: null });
    expect(clearEndsAt.status).toBe(200);
    expect(clearEndsAt.body.endsAt).toBeNull();
  });

  it('DELETE on an unknown id returns 404', async () => {
    const res = await request(app).delete('/api/v1/admin/announcements/999999999').set(auth(adminToken));
    expect(res.status).toBe(404);
  });

  it('PATCH on an unknown id returns 404', async () => {
    const res = await request(app).patch('/api/v1/admin/announcements/999999999').set(auth(adminToken)).send({ isActive: false });
    expect(res.status).toBe(404);
  });

  it('a title over the max length is rejected with 422', async () => {
    const res = await request(app).post('/api/v1/admin/announcements').set(auth(adminToken)).send({
      title: 'x'.repeat(200),
      body: 'ok',
      level: 'info',
      startsAt: '2026-10-01T00:00:00Z',
    });
    expect(res.status).toBe(422);
  });

  it('a body over the max length is rejected with 422', async () => {
    const res = await request(app).post('/api/v1/admin/announcements').set(auth(adminToken)).send({
      title: 'ok',
      body: 'x'.repeat(1200),
      level: 'info',
      startsAt: '2026-10-01T00:00:00Z',
    });
    expect(res.status).toBe(422);
  });

  it('a <script> tag in the body is rejected with 422 (HTML-filtering)', async () => {
    const res = await request(app).post('/api/v1/admin/announcements').set(auth(adminToken)).send({
      title: 'ok',
      body: '<script>alert(1)</script>',
      level: 'warning',
      startsAt: '2026-10-01T00:00:00Z',
    });
    expect(res.status).toBe(422);
  });
});
