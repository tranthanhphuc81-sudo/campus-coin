/**
 * refresh-logout.test.ts
 * Integration tests for `POST /api/v1/auth/refresh` and `/logout` against real MySQL + Redis.
 * Covers TC-04 (refresh rotates; reusing the old cookie fails and also kills the *new* token,
 * with an `auth.refresh.reuse_detected` audit row), the CSRF guard (missing Origin/
 * X-Requested-With → 403), logout (204, clears the cookie, and the old refresh token no longer
 * works), and that a revoked session's access token is rejected by `authenticate`.
 * Spec: docs/spec/09 §9.5–9.11 · Rules: BR-AU-05, BR-AU-06
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../../src/integrations/mailer/index.js', () => ({ queueEmail: vi.fn().mockResolvedValue(undefined) }));

const { createApp } = await import('../../../src/app.js');
const { config } = await import('../../../src/config/env.js');
const { prisma } = await import('../../../src/lib/prisma.js');
const { authenticate } = await import('../../../src/middlewares/authenticate.js');
const { errorHandler } = await import('../../../src/middlewares/errorHandler.js');
const { createActiveUser, cleanupTestUsers, flushRateLimits } = await import('../../fixtures/auth.js');

const ORIGIN = config.app.corsOrigins[0] ?? 'http://localhost:5174';
const CSRF_HEADERS = { Origin: ORIGIN, 'X-Requested-With': 'XMLHttpRequest' };

/** Extracts the `cc_rt` refresh cookie value from a Set-Cookie header array. */
function extractRefreshCookie(setCookie: string[]): string {
  const raw = setCookie.find((c) => c.startsWith('cc_rt='));
  if (!raw) throw new Error('cc_rt cookie not found');
  return raw.split(';')[0] ?? '';
}

describe.skipIf(!process.env.DATABASE_URL)('POST /api/v1/auth/refresh and /logout', () => {
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

  async function loginAndGetCookie() {
    const user = await createActiveUser();
    const login = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: user.password });
    return { user, cookie: extractRefreshCookie(login.headers['set-cookie'] as unknown as string[]) };
  }

  it('refresh without Origin/X-Requested-With is rejected (403)', async () => {
    const { cookie } = await loginAndGetCookie();

    const res = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie);

    expect(res.status).toBe(403);
  });

  it('rotates the refresh token; the old cookie is then invalid and using it revokes the new one too (TC-04)', async () => {
    const { user, cookie } = await loginAndGetCookie();

    const rotated = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie).set(CSRF_HEADERS);
    expect(rotated.status).toBe(200);
    const newCookie = extractRefreshCookie(rotated.headers['set-cookie'] as unknown as string[]);
    expect(newCookie).not.toBe(cookie);

    // Reusing the old (already-rotated) token is a reuse attempt: 401, and it revokes the family.
    const reuse = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie).set(CSRF_HEADERS);
    expect(reuse.status).toBe(401);

    // The *new* token, which was legitimately issued, is now also dead because reuse revoked the family.
    const afterReuse = await request(app).post('/api/v1/auth/refresh').set('Cookie', newCookie).set(CSRF_HEADERS);
    expect(afterReuse.status).toBe(401);

    const audit = await prisma.auditLog.findFirst({
      where: { actorId: user.id, action: 'auth.refresh.reuse_detected' },
    });
    expect(audit).not.toBeNull();
  });

  it('logout clears the cookie (204) and the refresh token no longer works afterwards', async () => {
    const { cookie } = await loginAndGetCookie();

    const logoutRes = await request(app).post('/api/v1/auth/logout').set('Cookie', cookie).set(CSRF_HEADERS);
    expect(logoutRes.status).toBe(204);
    const clearCookie = (logoutRes.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('cc_rt='));
    expect(clearCookie).toMatch(/Max-Age=0/);

    const afterLogout = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie).set(CSRF_HEADERS);
    expect(afterLogout.status).toBe(401);
  });

  it('logout with no cookie at all still returns 204', async () => {
    const res = await request(app).post('/api/v1/auth/logout').set(CSRF_HEADERS);
    expect(res.status).toBe(204);
  });

  it("a revoked session's access token is rejected by authenticate on a protected route", async () => {
    const user = await createActiveUser();
    const login = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: user.password });
    const accessToken = login.body.accessToken as string;
    const cookie = extractRefreshCookie(login.headers['set-cookie'] as unknown as string[]);

    const miniApp = express();
    miniApp.use(authenticate);
    miniApp.get('/protected', (req, res) => res.json({ userId: req.auth?.userId }));
    miniApp.use(errorHandler);

    const before = await request(miniApp).get('/protected').set('Authorization', `Bearer ${accessToken}`);
    expect(before.status).toBe(200);

    await request(app).post('/api/v1/auth/logout').set('Cookie', cookie).set(CSRF_HEADERS);

    const after = await request(miniApp).get('/protected').set('Authorization', `Bearer ${accessToken}`);
    expect(after.status).toBe(401);
  });
});
