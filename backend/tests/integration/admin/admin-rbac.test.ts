/**
 * admin-rbac.test.ts
 * TC-07: the blanket `/admin/*` guard (`app.ts`) applies to every P15 admin router too — a
 * logged-in student gets 403, an unauthenticated request gets 401. The MFA-gated admin login
 * itself is already fully covered by `admin-auth.test.ts`; this file only proves the guard reaches
 * the new routers. Security-fix follow-up: also proves the guard fires BEFORE any route-specific
 * validation on every POST/PATCH/DELETE across all 6 admin routers (a placeholder id/body is fine —
 * `authorize(Role.ADMIN)` is mounted before the sub-router, so a student never even reaches
 * `validate(...)`), plus the two extra endpoints the review called out by name.
 * Spec: docs/spec/09 §9.5-9.6 (RBAC) · Rules: BR handled by middlewares/authorize.ts
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

const { createApp } = await import('../../../src/app.js');
const { prisma } = await import('../../../src/lib/prisma.js');
const { createActiveUser, cleanupTestUsers, flushRateLimits } = await import('../../fixtures/auth.js');

const ADMIN_PATHS = [
  '/api/v1/admin/users',
  '/api/v1/admin/categories',
  '/api/v1/admin/tip-templates',
  '/api/v1/admin/announcements',
  '/api/v1/admin/stats/overview',
  '/api/v1/admin/audit-logs',
];

/** A placeholder id, valid enough to route-match `:id` — the RBAC guard rejects before it is ever read. */
const PLACEHOLDER_UUID = '00000000-0000-0000-0000-000000000000';
const PLACEHOLDER_INT_ID = '1';

/** Every write (POST/PATCH/DELETE) route across all 6 admin routers, plus the 3 extra GETs (the 2
 * the review called out by name, plus `GET /admin/users/:id` found during the P18 re-audit). */
const WRITE_AND_EXTRA_ROUTES: Array<{ method: 'get' | 'post' | 'patch' | 'delete'; path: string }> = [
  { method: 'get', path: `/api/v1/admin/users/${PLACEHOLDER_UUID}` },
  { method: 'post', path: `/api/v1/admin/users/${PLACEHOLDER_UUID}/disable` },
  { method: 'post', path: `/api/v1/admin/users/${PLACEHOLDER_UUID}/enable` },
  { method: 'post', path: `/api/v1/admin/users/${PLACEHOLDER_UUID}/send-reset` },
  { method: 'post', path: '/api/v1/admin/categories' },
  { method: 'patch', path: `/api/v1/admin/categories/${PLACEHOLDER_INT_ID}` },
  { method: 'delete', path: `/api/v1/admin/categories/${PLACEHOLDER_INT_ID}` },
  { method: 'post', path: '/api/v1/admin/tip-templates' },
  { method: 'post', path: '/api/v1/admin/tip-templates/preview' },
  { method: 'patch', path: `/api/v1/admin/tip-templates/${PLACEHOLDER_INT_ID}` },
  { method: 'delete', path: `/api/v1/admin/tip-templates/${PLACEHOLDER_INT_ID}` },
  { method: 'post', path: '/api/v1/admin/announcements' },
  { method: 'patch', path: `/api/v1/admin/announcements/${PLACEHOLDER_INT_ID}` },
  { method: 'delete', path: `/api/v1/admin/announcements/${PLACEHOLDER_INT_ID}` },
  { method: 'get', path: '/api/v1/admin/stats/categories-usage' },
];

describe.skipIf(!process.env.DATABASE_URL)('/api/v1/admin/* RBAC guard', () => {
  const app = createApp();

  beforeEach(async () => {
    await flushRateLimits();
  });

  afterEach(async () => {
    await cleanupTestUsers();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it.each(ADMIN_PATHS)('%s: no access token -> 401', async (path) => {
    const res = await request(app).get(path);
    expect(res.status).toBe(401);
  });

  it('TC-07: a student access token on GET /admin/users gets 403 (not 404, not 200)', async () => {
    const student = await createActiveUser();
    const login = await request(app).post('/api/v1/auth/login').send({ email: student.email, password: student.password });

    const res = await request(app).get('/api/v1/admin/users').set('Authorization', `Bearer ${login.body.accessToken}`);

    expect(res.status).toBe(403);
  });

  it.each(WRITE_AND_EXTRA_ROUTES)('$method $path: a student access token gets 403 (not the route\'s own validation error)', async ({ method, path }) => {
    const student = await createActiveUser();
    const login = await request(app).post('/api/v1/auth/login').send({ email: student.email, password: student.password });

    const res = await request(app)[method](path).set('Authorization', `Bearer ${login.body.accessToken}`).send({});

    expect(res.status).toBe(403);
  });
});
