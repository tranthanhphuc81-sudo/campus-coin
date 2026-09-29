/**
 * delete-account.test.ts
 * Integration tests for `DELETE /api/v1/me` against real MySQL + Redis (skipped without
 * DATABASE_URL). Covers wrong password (422 + lockout counter), success (202, disabled +
 * `deletedAt` set, refresh cookie cleared, old access token rejected, login now 403
 * account-disabled, `forgotPassword` no-ops on the now-disabled email), the `account-delete-*`
 * `queueEmail` call, the `user.delete.requested` audit row, and admin `enable()` reversing it.
 * Spec: docs/spec/09 §9.14 (right to erasure)
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const queueEmailMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../src/integrations/mailer/index.js', () => ({ queueEmail: queueEmailMock }));

const { createApp } = await import('../../../src/app.js');
const { prisma } = await import('../../../src/lib/prisma.js');
const { redis } = await import('../../../src/lib/redis.js');
const { config } = await import('../../../src/config/env.js');
const { createActiveUser, cleanupTestUsers, STRONG_PASSWORD } = await import('../../fixtures/auth.js');
const { createAdminWithTotp, loginAsAdmin, cleanupTestAdmins } = await import('../../fixtures/admin.js');
const authService = await import('../../../src/modules/auth/auth.service.js');

const ORIGIN_HEADERS = { Origin: config.app.corsOrigins[0] ?? 'http://localhost:5174', 'X-Requested-With': 'x' };

/** Extracts the `cc_rt` refresh cookie value from a Set-Cookie header array. */
function extractRefreshCookie(setCookie: string[]): string {
  const raw = setCookie.find((c) => c.startsWith('cc_rt='));
  if (!raw) throw new Error('cc_rt cookie not found');
  return raw.split(';')[0] ?? '';
}

describe.skipIf(!process.env.DATABASE_URL)('DELETE /api/v1/me', () => {
  const app = createApp();

  beforeEach(async () => {
    queueEmailMock.mockClear();
    const keys = await redis.keys('rl:change-password:*');
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
    return {
      user,
      accessToken: login.body.accessToken as string,
      cookie: extractRefreshCookie(login.headers['set-cookie'] as unknown as string[]),
    };
  }

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  it('wrong password is 422 and counts toward the shared lockout counter', async () => {
    const { user, accessToken } = await loginAs();

    const res = await request(app).delete('/api/v1/me').set(auth(accessToken)).send({ password: 'totally-wrong-Password1', confirm: 'DELETE' });

    expect(res.status).toBe(422);
    expect(res.body.errors?.[0]?.field).toBe('password');

    const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(dbUser.failedLoginCount).toBe(1);
    expect(dbUser.status).toBe('active'); // never disabled by a failed attempt.
  });

  it('a bad confirm phrase is 422 (never reaches the service)', async () => {
    const { accessToken } = await loginAs();
    const res = await request(app).delete('/api/v1/me').set(auth(accessToken)).send({ password: STRONG_PASSWORD, confirm: 'delete' });
    expect(res.status).toBe(422);
  });

  it('success: 202 + scheduledPurgeAt, disables the account, clears deletedAt=set, clears the refresh cookie, old access token now 401, login now 403 account-disabled, forgotPassword no-ops, queueEmail + audit row written', async () => {
    const { user, accessToken, cookie } = await loginAs();

    const res = await request(app).delete('/api/v1/me').set(auth(accessToken)).send({ password: user.password, confirm: 'DELETE' });

    expect(res.status).toBe(202);
    expect(res.body.scheduledPurgeAt).toBeTruthy();
    expect(new Date(res.body.scheduledPurgeAt).getTime()).toBeGreaterThan(Date.now());

    // Refresh cookie cleared on the response (Max-Age=0).
    const setCookie = res.headers['set-cookie'] as unknown as string[];
    expect(setCookie.some((c) => c.startsWith('cc_rt=') && c.includes('Max-Age=0'))).toBe(true);

    const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(dbUser.status).toBe('disabled');
    expect(dbUser.deletedAt).not.toBeNull();

    // The already-issued access token is dead (session revoked).
    const meAfterDelete = await request(app).get('/api/v1/me').set(auth(accessToken));
    expect(meAfterDelete.status).toBe(401);

    // The refresh cookie no longer works either.
    const refreshAfterDelete = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie).set(ORIGIN_HEADERS);
    expect(refreshAfterDelete.status).toBe(401);

    // Logging in with the correct password now returns 403 account-disabled (not the credentials error).
    const loginAfterDelete = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: user.password });
    expect(loginAfterDelete.status).toBe(403);
    expect(loginAfterDelete.body.type).toBe('account-disabled');

    // forgotPassword silently no-ops for a disabled account — no new reset token is created.
    const tokensBefore = await prisma.authToken.count({ where: { userId: user.id, purpose: 'reset_password' } });
    await authService.forgotPassword(user.email);
    const tokensAfter = await prisma.authToken.count({ where: { userId: user.id, purpose: 'reset_password' } });
    expect(tokensAfter).toBe(tokensBefore);

    // queueEmail called with the documented jobId shape (no bare ':', timestamp-suffixed so a
    // cancel+redelete cycle never collides with an earlier completed job under the same id — Fix 3).
    expect(queueEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: user.email, jobId: expect.stringMatching(new RegExp(`^account-delete-${user.id}-\\d+$`)) }),
    );

    const auditRow = await prisma.auditLog.findFirst({ where: { actorId: user.id, action: 'user.delete.requested' } });
    expect(auditRow).not.toBeNull();
    expect(auditRow!.entityType).toBe('user');
    expect(auditRow!.entityId).toBe(user.id);
    expect((auditRow!.metadata as { purgeAfter?: string } | null)?.purgeAfter).toBeTruthy();
  });

  it('Fix 1: a queueEmail failure (e.g. Redis down) still returns 202, disables the account, clears the cookie, and writes the audit row', async () => {
    const { user, accessToken } = await loginAs();
    queueEmailMock.mockRejectedValueOnce(new Error('redis down'));

    const res = await request(app).delete('/api/v1/me').set(auth(accessToken)).send({ password: user.password, confirm: 'DELETE' });

    expect(res.status).toBe(202);
    expect(res.body.scheduledPurgeAt).toBeTruthy();

    // The refresh cookie is still cleared even though the email enqueue failed.
    const setCookie = res.headers['set-cookie'] as unknown as string[];
    expect(setCookie.some((c) => c.startsWith('cc_rt=') && c.includes('Max-Age=0'))).toBe(true);

    // The irreversible disable write happened regardless of the email failure.
    const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(dbUser.status).toBe('disabled');
    expect(dbUser.deletedAt).not.toBeNull();

    // The audit trail is never lost, even though `queueEmail` rejected.
    const auditRow = await prisma.auditLog.findFirst({ where: { actorId: user.id, action: 'user.delete.requested' } });
    expect(auditRow).not.toBeNull();
  });

  it('an admin can cancel the deletion via enable(), clearing deletedAt', async () => {
    const { user, accessToken } = await loginAs();
    const res = await request(app).delete('/api/v1/me').set(auth(accessToken)).send({ password: user.password, confirm: 'DELETE' });
    expect(res.status).toBe(202);

    const admin = await createAdminWithTotp();
    const adminToken = await loginAsAdmin(app, admin);
    const enable = await request(app).post(`/api/v1/admin/users/${user.id}/enable`).set(auth(adminToken));
    expect(enable.status).toBe(204);

    const restored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(restored.status).toBe('active');
    expect(restored.deletedAt).toBeNull();
  });

  it('an admin token is 403 (student-only route)', async () => {
    const admin = await createAdminWithTotp();
    const adminToken = await loginAsAdmin(app, admin);
    const res = await request(app).delete('/api/v1/me').set(auth(adminToken)).send({ password: admin.password, confirm: 'DELETE' });
    expect(res.status).toBe(403);
  });

  it('no token is 401', async () => {
    const res = await request(app).delete('/api/v1/me').send({ password: 'whatever', confirm: 'DELETE' });
    expect(res.status).toBe(401);
  });
});
