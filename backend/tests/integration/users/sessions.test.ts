/**
 * sessions.test.ts
 * Integration tests for `GET /api/v1/me/sessions`, `DELETE /api/v1/me/sessions/:id` and
 * `POST /api/v1/auth/logout-all` against real MySQL + Redis (skipped without DATABASE_URL).
 * Covers listing two sessions with exactly one flagged `current`, revoking another session (its
 * refresh token then fails), revoking someone else's session id (404, not 403 — cross-tenant
 * invariant), and logout-all killing every session including the caller's own.
 * Spec: docs/spec/07 §7.3.1 · docs/spec/09 §9.5 · Rules: BR-AU-06
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../../src/integrations/mailer/index.js', () => ({ queueEmail: vi.fn().mockResolvedValue(undefined) }));

const { createApp } = await import('../../../src/app.js');
const { config } = await import('../../../src/config/env.js');
const { prisma } = await import('../../../src/lib/prisma.js');
const { createActiveUser, cleanupTestUsers, flushRateLimits } = await import('../../fixtures/auth.js');

const ORIGIN = config.app.corsOrigins[0] ?? 'http://localhost:5174';
const CSRF_HEADERS = { Origin: ORIGIN, 'X-Requested-With': 'XMLHttpRequest' };

/** Extracts the `cc_rt` refresh cookie value from a Set-Cookie header array. */
function extractRefreshCookie(setCookie: string[]): string {
  const raw = setCookie.find((c) => c.startsWith('cc_rt='));
  if (!raw) throw new Error('cc_rt cookie not found');
  return raw.split(';')[0] ?? '';
}

describe.skipIf(!process.env.DATABASE_URL)('/api/v1/me/sessions and /api/v1/auth/logout-all', () => {
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

  async function login(user: { email: string; password: string }) {
    const res = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: user.password });
    return {
      accessToken: res.body.accessToken as string,
      cookie: extractRefreshCookie(res.headers['set-cookie'] as unknown as string[]),
    };
  }

  it('lists two active sessions after two logins, exactly one flagged current', async () => {
    const user = await createActiveUser();
    const first = await login(user);
    const second = await login(user);

    const res = await request(app).get('/api/v1/me/sessions').set('Authorization', `Bearer ${second.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    const currentFlags = res.body.map((s: { current: boolean }) => s.current);
    expect(currentFlags.filter(Boolean)).toHaveLength(1);
    for (const session of res.body as Array<Record<string, unknown>>) {
      expect(session.ipHash).toBeUndefined();
      expect(session.tokenHash).toBeUndefined();
    }

    // Cleanup guard against unused var lint.
    void first;
  });

  it('DELETE /me/sessions/:id revokes another session; its refresh token then fails', async () => {
    const user = await createActiveUser();
    const first = await login(user);
    const second = await login(user);

    const list = await request(app).get('/api/v1/me/sessions').set('Authorization', `Bearer ${second.accessToken}`);
    const other = (list.body as Array<{ id: string; current: boolean }>).find((s) => !s.current);
    expect(other).toBeDefined();

    const del = await request(app)
      .delete(`/api/v1/me/sessions/${other!.id}`)
      .set('Authorization', `Bearer ${second.accessToken}`);
    expect(del.status).toBe(204);

    const refreshFirst = await request(app).post('/api/v1/auth/refresh').set('Cookie', first.cookie).set(CSRF_HEADERS);
    expect(refreshFirst.status).toBe(401);
  });

  it('DELETE /me/sessions/:id for another user\'s session id is 404 (not 403)', async () => {
    const userA = await createActiveUser();
    const userB = await createActiveUser();
    const sessionA = await login(userA);
    const sessionB = await login(userB);

    const listA = await request(app).get('/api/v1/me/sessions').set('Authorization', `Bearer ${sessionA.accessToken}`);
    const idA = (listA.body as Array<{ id: string }>)[0]?.id as string;

    const res = await request(app)
      .delete(`/api/v1/me/sessions/${idA}`)
      .set('Authorization', `Bearer ${sessionB.accessToken}`);

    expect(res.status).toBe(404);
  });

  it('DELETE /me/sessions/:id with a malformed id is 422', async () => {
    const user = await createActiveUser();
    const session = await login(user);

    const res = await request(app)
      .delete('/api/v1/me/sessions/not-a-uuid')
      .set('Authorization', `Bearer ${session.accessToken}`);

    expect(res.status).toBe(422);
  });

  it('POST /auth/logout-all signs out every session, including the caller\'s own', async () => {
    const user = await createActiveUser();
    const first = await login(user);
    const second = await login(user);

    const res = await request(app)
      .post('/api/v1/auth/logout-all')
      .set('Authorization', `Bearer ${second.accessToken}`)
      .set(CSRF_HEADERS);
    expect(res.status).toBe(204);

    const refreshFirst = await request(app).post('/api/v1/auth/refresh').set('Cookie', first.cookie).set(CSRF_HEADERS);
    expect(refreshFirst.status).toBe(401);
    const refreshSecond = await request(app).post('/api/v1/auth/refresh').set('Cookie', second.cookie).set(CSRF_HEADERS);
    expect(refreshSecond.status).toBe(401);
  });
});
