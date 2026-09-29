/**
 * admin-users.test.ts
 * Integration tests for `/api/v1/admin/users` against real MySQL + Redis (skipped without
 * DATABASE_URL). Covers search/filter/pagination, detail 404 + response shape (no
 * transaction/category/budget content, only a count), disable (BR-AU-08: the target's next
 * `/auth/refresh` AND next `/me` 401 via session revocation, outstanding tokens get `usedAt` set,
 * idempotent on a 2nd call) + enable (Fix 1: only ever restores the pre-disable status, and only
 * from `disabled`), send-reset (BR-AU-03 reuse of `authService.forgotPassword`, correctly
 * attributed to the admin not the target — Fix 4 — its own target-scoped rate limit — Fix 3 — and
 * the admin's own audit row surviving a `forgotPassword` throw), and that admin accounts are wholly
 * invisible/untargetable through this router (Fix 2).
 * Spec: docs/spec/05c §5.13 · Rules: BR-AU-03, BR-AU-08
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { UserStatus } from '@campuscoin/shared';
import type * as AuthServiceModule from '../../../src/modules/auth/auth.service.js';

const queueEmailMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../src/integrations/mailer/index.js', () => ({ queueEmail: queueEmailMock }));

// Fix 4/test 4: wraps the real `forgotPassword` by default (so every other test in this file keeps
// its normal behavior) but lets a single test override it with `mockRejectedValueOnce` to prove the
// admin's own audit row still gets written even when it throws.
const forgotPasswordMock = vi.fn();
vi.mock('../../../src/modules/auth/auth.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof AuthServiceModule>();
  forgotPasswordMock.mockImplementation(actual.forgotPassword);
  return { ...actual, forgotPassword: forgotPasswordMock };
});

const { createApp } = await import('../../../src/app.js');
const { config } = await import('../../../src/config/env.js');
const { prisma } = await import('../../../src/lib/prisma.js');
const { hashPassword } = await import('../../../src/lib/password.js');
const { createActiveUser, cleanupTestUsers, flushRateLimits, trackUserForCleanup, uniqueEmail, STRONG_PASSWORD } = await import(
  '../../fixtures/auth.js'
);
const { cleanupTestAdmins, createAdminWithTotp, loginAsAdmin } = await import('../../fixtures/admin.js');

/** Creates a never-verified `pending` user directly in the DB (Fix 1 test: disable->enable must not activate it). */
async function createPendingUser(): Promise<{ id: string; email: string }> {
  const email = uniqueEmail();
  const passwordHash = await hashPassword(STRONG_PASSWORD);
  const user = await prisma.user.create({
    data: { email, passwordHash, fullName: 'Pending Student', status: UserStatus.PENDING },
  });
  trackUserForCleanup(user.id);
  return { id: user.id, email };
}

const ORIGIN = config.app.corsOrigins[0] ?? 'http://localhost:5174';
const CSRF_HEADERS = { Origin: ORIGIN, 'X-Requested-With': 'XMLHttpRequest' };

/** Extracts the `cc_rt` refresh cookie value from a Set-Cookie header array. */
function extractRefreshCookie(setCookie: string[]): string {
  const raw = setCookie.find((c) => c.startsWith('cc_rt='));
  if (!raw) throw new Error('cc_rt cookie not found');
  return raw.split(';')[0] ?? '';
}

describe.skipIf(!process.env.DATABASE_URL)('/api/v1/admin/users', () => {
  const app = createApp();
  let adminToken: string;
  let adminId: string;

  beforeEach(async () => {
    await flushRateLimits();
    queueEmailMock.mockClear();
    forgotPasswordMock.mockClear();
    const admin = await createAdminWithTotp();
    adminId = admin.id;
    adminToken = await loginAsAdmin(app, admin);
  });

  afterEach(async () => {
    await cleanupTestAdmins();
    await cleanupTestUsers();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  it('search/filter/pagination', async () => {
    const student = await createActiveUser({ fullName: `Zed Finder ${Date.now()}` });

    const bySearch = await request(app)
      .get('/api/v1/admin/users')
      .query({ q: student.fullName, page: 1, limit: 5 })
      .set(auth(adminToken));
    expect(bySearch.status).toBe(200);
    expect(bySearch.body.meta.page).toBe(1);
    expect(bySearch.body.data.some((u: { id: string }) => u.id === student.id)).toBe(true);
    expect(bySearch.body.data[0].maskedEmail).toMatch(/\*\*\*/);
    expect(bySearch.body.data[0].email).toBeUndefined();

    const byStatus = await request(app)
      .get('/api/v1/admin/users')
      .query({ status: UserStatus.ACTIVE, page: 1, limit: 100 })
      .set(auth(adminToken));
    expect(byStatus.status).toBe(200);
    expect(byStatus.body.data.every((u: { status: string }) => u.status === 'active')).toBe(true);
  });

  it('detail 404 for an unknown id', async () => {
    const res = await request(app).get('/api/v1/admin/users/00000000-0000-0000-0000-000000000000').set(auth(adminToken));
    expect(res.status).toBe(404);
  });

  it('GET /admin/users/:id never exposes transactions/categories/budgets — only a count', async () => {
    const student = await createActiveUser();

    const res = await request(app).get(`/api/v1/admin/users/${student.id}`).set(auth(adminToken));

    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(
      ['createdAt', 'email', 'fullName', 'id', 'lastLoginAt', 'status', 'transactionCount'].sort(),
    );
    expect(typeof res.body.transactionCount).toBe('number');
  });

  it('disable revokes the session (refresh AND /me 401) and invalidates outstanding tokens; enable reverses it', async () => {
    const student = await createActiveUser();
    const login = await request(app).post('/api/v1/auth/login').send({ email: student.email, password: student.password });
    const cookie = extractRefreshCookie(login.headers['set-cookie'] as unknown as string[]);
    const accessToken = login.body.accessToken as string;

    // Two outstanding tokens BR-AU-08 must invalidate on disable.
    const { AuthTokenPurpose } = await import('../../../src/generated/prisma/enums.js');
    const { sha256Hex } = await import('../../../src/lib/tokens.js');
    await prisma.authToken.create({
      data: {
        userId: student.id,
        purpose: AuthTokenPurpose.verify_email,
        tokenHash: sha256Hex(`verify-${student.id}`),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    await prisma.authToken.create({
      data: {
        userId: student.id,
        purpose: AuthTokenPurpose.reset_password,
        tokenHash: sha256Hex(`reset-${student.id}`),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const disable = await request(app).post(`/api/v1/admin/users/${student.id}/disable`).set(auth(adminToken));
    expect(disable.status).toBe(204);

    const disabledUser = await prisma.user.findUniqueOrThrow({ where: { id: student.id } });
    expect(disabledUser.status).toBe(UserStatus.DISABLED);

    const refreshAfterDisable = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie).set(CSRF_HEADERS);
    expect(refreshAfterDisable.status).toBe(401);

    // The already-issued access token dies too (session revoked), not just the refresh cookie.
    const meAfterDisable = await request(app).get('/api/v1/me').set('Authorization', `Bearer ${accessToken}`);
    expect(meAfterDisable.status).toBe(401);

    const outstandingTokens = await prisma.authToken.findMany({ where: { userId: student.id } });
    expect(outstandingTokens.length).toBe(2);
    expect(outstandingTokens.every((t) => t.usedAt !== null)).toBe(true);

    const disableAudit = await prisma.auditLog.findFirst({ where: { actorId: adminId, action: 'admin.user.disable', entityId: student.id } });
    expect(disableAudit).not.toBeNull();

    // Fix 5: disable is safely retryable — a 2nd call on an already-disabled user still succeeds
    // cleanly (every step is naturally idempotent) and writes its own audit row.
    const disableAgain = await request(app).post(`/api/v1/admin/users/${student.id}/disable`).set(auth(adminToken));
    expect(disableAgain.status).toBe(204);
    const disableAuditCount = await prisma.auditLog.count({ where: { actorId: adminId, action: 'admin.user.disable', entityId: student.id } });
    expect(disableAuditCount).toBe(2);

    const enable = await request(app).post(`/api/v1/admin/users/${student.id}/enable`).set(auth(adminToken));
    expect(enable.status).toBe(204);

    const enabledUser = await prisma.user.findUniqueOrThrow({ where: { id: student.id } });
    expect(enabledUser.status).toBe(UserStatus.ACTIVE);
  });

  it('POST /:id/disable and /enable 404 for an unknown id', async () => {
    const res = await request(app).post('/api/v1/admin/users/00000000-0000-0000-0000-000000000000/disable').set(auth(adminToken));
    expect(res.status).toBe(404);
  });

  it('P16: enable() clears deletedAt (cancels a pending self-deletion) and audits cancelledDeletion:true', async () => {
    const student = await createActiveUser();
    await prisma.user.update({ where: { id: student.id }, data: { status: UserStatus.DISABLED, deletedAt: new Date() } });

    const enable = await request(app).post(`/api/v1/admin/users/${student.id}/enable`).set(auth(adminToken));
    expect(enable.status).toBe(204);

    const restored = await prisma.user.findUniqueOrThrow({ where: { id: student.id } });
    expect(restored.status).toBe(UserStatus.ACTIVE);
    expect(restored.deletedAt).toBeNull();

    const enableAudit = await prisma.auditLog.findFirst({ where: { actorId: adminId, action: 'admin.user.enable', entityId: student.id } });
    expect(enableAudit).not.toBeNull();
    expect((enableAudit!.metadata as { cancelledDeletion?: boolean } | null)?.cancelledDeletion).toBe(true);
  });

  it('Fix 1: enabling a never-disabled pending user 409s; enabling a disabled-then-restored pending user stays pending', async () => {
    const pending = await createPendingUser();

    // Never disabled -> enable is a no-op that would otherwise silently grant "active": reject it.
    const enableWithoutDisable = await request(app).post(`/api/v1/admin/users/${pending.id}/enable`).set(auth(adminToken));
    expect(enableWithoutDisable.status).toBe(409);

    const disable = await request(app).post(`/api/v1/admin/users/${pending.id}/disable`).set(auth(adminToken));
    expect(disable.status).toBe(204);

    const enable = await request(app).post(`/api/v1/admin/users/${pending.id}/enable`).set(auth(adminToken));
    expect(enable.status).toBe(204);

    const restored = await prisma.user.findUniqueOrThrow({ where: { id: pending.id } });
    // Never `active` with a null `emailVerifiedAt` — that would bypass email verification.
    expect(restored.status).toBe(UserStatus.PENDING);
    expect(restored.emailVerifiedAt).toBeNull();
  });

  it('Fix 2: disable/enable/send-reset on another admin (or the caller itself) 404s and leaves it untouched', async () => {
    const otherAdmin = await createAdminWithTotp();
    const otherAdminToken = await loginAsAdmin(app, otherAdmin);

    const disableOther = await request(app).post(`/api/v1/admin/users/${otherAdmin.id}/disable`).set(auth(adminToken));
    expect(disableOther.status).toBe(404);
    const enableOther = await request(app).post(`/api/v1/admin/users/${otherAdmin.id}/enable`).set(auth(adminToken));
    expect(enableOther.status).toBe(404);
    const resetOther = await request(app).post(`/api/v1/admin/users/${otherAdmin.id}/send-reset`).set(auth(adminToken));
    expect(resetOther.status).toBe(404);

    const disableSelf = await request(app).post(`/api/v1/admin/users/${adminId}/disable`).set(auth(adminToken));
    expect(disableSelf.status).toBe(404);

    // The other admin's account and session are completely unaffected.
    const otherAdminRow = await prisma.user.findUniqueOrThrow({ where: { id: otherAdmin.id } });
    expect(otherAdminRow.status).toBe(UserStatus.ACTIVE);
    const meAsOtherAdmin = await request(app).get('/api/v1/me').set('Authorization', `Bearer ${otherAdminToken}`);
    expect(meAsOtherAdmin.status).toBe(200);

    // Admin accounts don't even show up in the list (Fix 2: student accounts only).
    const list = await request(app).get('/api/v1/admin/users').query({ q: otherAdmin.email, page: 1, limit: 100 }).set(auth(adminToken));
    expect(list.body.data.some((u: { id: string }) => u.id === otherAdmin.id)).toBe(false);
  });

  it('send-reset enqueues an email and writes both the correctly-attributed admin audit rows', async () => {
    const student = await createActiveUser();

    const res = await request(app).post(`/api/v1/admin/users/${student.id}/send-reset`).set(auth(adminToken));
    expect(res.status).toBe(202);
    expect(queueEmailMock).toHaveBeenCalledTimes(1);

    // Fix 4: the auth-layer audit row is attributed to the ADMIN, not the target, and records who
    // the real target was in `metadata` — never misread as the target requesting their own reset.
    const resetRequestedAudit = await prisma.auditLog.findFirst({
      where: { actorId: adminId, action: 'auth.password.reset_requested' },
      orderBy: { id: 'desc' },
    });
    expect(resetRequestedAudit).not.toBeNull();
    expect((resetRequestedAudit!.metadata as { via?: string; targetUserId?: string } | null)?.via).toBe('admin');
    expect((resetRequestedAudit!.metadata as { via?: string; targetUserId?: string } | null)?.targetUserId).toBe(student.id);

    const noMisattributedAudit = await prisma.auditLog.findFirst({
      where: { actorId: student.id, action: 'auth.password.reset_requested' },
    });
    expect(noMisattributedAudit).toBeNull();

    const adminAudit = await prisma.auditLog.findFirst({
      where: { actorId: adminId, action: 'admin.user.send_reset_link', entityId: student.id },
    });
    expect(adminAudit).not.toBeNull();
  });

  it('Fix 3: a 4th send-reset for the same target within an hour 429s (only 3 emails queued)', async () => {
    const student = await createActiveUser();

    const results: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const res = await request(app).post(`/api/v1/admin/users/${student.id}/send-reset`).set(auth(adminToken));
      results.push(res.status);
    }

    expect(results.slice(0, 3)).toEqual([202, 202, 202]);
    expect(results[3]).toBe(429);
    expect(queueEmailMock).toHaveBeenCalledTimes(3);
  });

  it('Fix 4: admin.user.send_reset_link is still written even when forgotPassword throws', async () => {
    const student = await createActiveUser();
    forgotPasswordMock.mockRejectedValueOnce(new Error('simulated forgotPassword failure'));

    const res = await request(app).post(`/api/v1/admin/users/${student.id}/send-reset`).set(auth(adminToken));
    expect(res.status).toBe(500);

    const adminAudit = await prisma.auditLog.findFirst({
      where: { actorId: adminId, action: 'admin.user.send_reset_link', entityId: student.id },
    });
    expect(adminAudit).not.toBeNull();
  });
});
