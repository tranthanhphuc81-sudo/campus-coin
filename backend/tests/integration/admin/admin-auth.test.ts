/**
 * admin-auth.test.ts
 * Integration tests for `POST /api/v1/admin/auth/login` and `/mfa/verify` against real MySQL +
 * Redis, plus the blanket `/admin/*` guard (TC-07) and cross-role login rejections.
 * Covers TC-08 (wrong TOTP), replay protection (same code on a fresh token, a used-token replay),
 * the attempts cap, A-M4 fail-closed login for an unenrolled admin (enrolment now only happens via
 * `scripts/create-admin.ts`), single-use recovery codes, student/admin credentials on the wrong login endpoint,
 * the admin-only guard on other `/admin/*` paths, an MFA token rejected on a normal route, and
 * the admin idle-timeout on refresh (BR-AU-07).
 * Spec: docs/spec/05a §5.1.2 · docs/spec/09 §9.5, §9.7 · Rules: BR-AU-09
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generate } from 'otplib';
import request from 'supertest';
import { ADMIN_ACCESS_TOKEN_TTL_SEC, Role } from '@campuscoin/shared';

vi.mock('../../../src/integrations/mailer/index.js', () => ({ queueEmail: vi.fn().mockResolvedValue(undefined) }));

const { createApp } = await import('../../../src/app.js');
const { config } = await import('../../../src/config/env.js');
const { prisma } = await import('../../../src/lib/prisma.js');
const { sha256Hex } = await import('../../../src/lib/tokens.js');
const { flushRateLimits } = await import('../../fixtures/auth.js');
const {
  cleanupTestAdmins,
  createAdminForEnrolment,
  createAdminWithRecoveryCodes,
  createAdminWithTotp,
  createStudentForAdminTests,
} = await import('../../fixtures/admin.js');

const ORIGIN = config.app.corsOrigins[0] ?? 'http://localhost:5174';
const CSRF_HEADERS = { Origin: ORIGIN, 'X-Requested-With': 'XMLHttpRequest' };

/** Extracts the `cc_rt` refresh cookie value from a Set-Cookie header array. */
function extractRefreshCookie(setCookie: string[]): string {
  const raw = setCookie.find((c) => c.startsWith('cc_rt='));
  if (!raw) throw new Error('cc_rt cookie not found');
  return raw.split(';')[0] ?? '';
}

describe.skipIf(!process.env.DATABASE_URL)('POST /api/v1/admin/auth/login and /mfa/verify', () => {
  const app = createApp();

  beforeEach(async () => {
    await flushRateLimits();
  });

  afterEach(async () => {
    await cleanupTestAdmins();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** Logs in an already-enrolled admin and returns its fresh `mfaToken`. */
  async function loginForMfaToken(admin: { email: string; password: string }): Promise<string> {
    const res = await request(app).post('/api/v1/admin/auth/login').send({ email: admin.email, password: admin.password });
    expect(res.status).toBe(200);
    expect(res.body.mfaRequired).toBe(true);
    expect(res.body.enrolment).toBeUndefined();
    return res.body.mfaToken as string;
  }

  it('TC-08: a wrong TOTP code is rejected with 401 mfa-invalid and audits admin.mfa.failed', async () => {
    const admin = await createAdminWithTotp();
    const mfaToken = await loginForMfaToken(admin);
    const validCode = await generate({ secret: admin.secret });
    const wrongCode = validCode === '000000' ? '111111' : '000000';

    const res = await request(app).post('/api/v1/admin/auth/mfa/verify').send({ mfaToken, code: wrongCode });

    expect(res.status).toBe(401);
    expect(res.body.type).toBe('mfa-invalid');
    const audit = await prisma.auditLog.findFirst({ where: { actorId: admin.id, action: 'admin.mfa.failed' } });
    expect(audit).not.toBeNull();
  });

  it('a correct TOTP code returns a 10-min admin access token + refresh cookie and audits admin.login', async () => {
    const admin = await createAdminWithTotp();
    const mfaToken = await loginForMfaToken(admin);
    const code = await generate({ secret: admin.secret });

    const res = await request(app).post('/api/v1/admin/auth/mfa/verify').send({ mfaToken, code });

    expect(res.status).toBe(200);
    expect(res.body.tokenType).toBe('Bearer');
    expect(res.body.expiresIn).toBe(ADMIN_ACCESS_TOKEN_TTL_SEC);
    expect(res.body.user.role).toBe(Role.ADMIN);
    expect(res.body.recoveryCodes).toBeUndefined();

    const setCookie = res.headers['set-cookie'] as unknown as string[];
    expect(setCookie.some((c) => c.startsWith('cc_rt='))).toBe(true);

    const me = await request(app).get('/api/v1/me').set('Authorization', `Bearer ${res.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.role).toBe(Role.ADMIN);

    const audit = await prisma.auditLog.findFirst({ where: { actorId: admin.id, action: 'admin.login' } });
    expect(audit).not.toBeNull();
  });

  it('replays the same code/time-step against a fresh mfaToken and is rejected', async () => {
    const admin = await createAdminWithTotp();
    const code = await generate({ secret: admin.secret });

    const firstToken = await loginForMfaToken(admin);
    const first = await request(app).post('/api/v1/admin/auth/mfa/verify').send({ mfaToken: firstToken, code });
    expect(first.status).toBe(200);

    await flushRateLimits();
    const secondToken = await loginForMfaToken(admin);
    const replay = await request(app).post('/api/v1/admin/auth/mfa/verify').send({ mfaToken: secondToken, code });
    expect(replay.status).toBe(401);
    expect(replay.body.type).toBe('mfa-invalid');
  });

  it('an mfaToken reused after a successful verify is rejected (single-use)', async () => {
    const admin = await createAdminWithTotp();
    const mfaToken = await loginForMfaToken(admin);
    const code = await generate({ secret: admin.secret });

    const first = await request(app).post('/api/v1/admin/auth/mfa/verify').send({ mfaToken, code });
    expect(first.status).toBe(200);

    const second = await request(app).post('/api/v1/admin/auth/mfa/verify').send({ mfaToken, code });
    expect(second.status).toBe(401);
    expect(second.body.type).toBe('mfa-invalid');
  });

  it('the 6th attempt on the same mfaToken is rejected even with the correct code', async () => {
    const admin = await createAdminWithTotp();
    const mfaToken = await loginForMfaToken(admin);
    const code = await generate({ secret: admin.secret });
    const wrongCode = code === '000000' ? '111111' : '000000';

    for (let i = 0; i < 5; i += 1) {
      const res = await request(app).post('/api/v1/admin/auth/mfa/verify').send({ mfaToken, code: wrongCode });
      expect(res.status).toBe(401);
    }

    // The IP+mfaToken rate limiter is also 5/min (Table 46) — flush it so this 6th call exercises
    // the *application-level* attempts cap (mfa:attempts:{jti}) specifically, not the rate limiter
    // (already covered by tests/integration/rateLimit.test.ts).
    await flushRateLimits();
    const sixth = await request(app).post('/api/v1/admin/auth/mfa/verify').send({ mfaToken, code });
    expect(sixth.status).toBe(401);
    expect(sixth.body.type).toBe('mfa-invalid');
  });

  it('A-M4: login for an admin with no MFA secret enrolled fails closed (401, no enrolment payload, no session) and audits admin.mfa.failed', async () => {
    const admin = await createAdminForEnrolment();

    const loginRes = await request(app).post('/api/v1/admin/auth/login').send({ email: admin.email, password: admin.password });

    expect(loginRes.status).toBe(401);
    expect(loginRes.body.type).toBe('unauthenticated');
    expect(loginRes.body.enrolment).toBeUndefined();
    expect(loginRes.body.mfaToken).toBeUndefined();

    const audit = await prisma.auditLog.findFirst({
      where: { actorId: admin.id, action: 'admin.mfa.failed' },
      orderBy: { id: 'desc' },
    });
    expect(audit).not.toBeNull();
    expect((audit?.metadata as { reason?: string } | null)?.reason).toBe('not_enrolled');

    const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } });
    expect(dbUser.mfaSecretEnc).toBeNull();
  });

  it('a recovery code works once and is rejected the second time', async () => {
    const admin = await createAdminWithRecoveryCodes();
    const [recoveryCode] = admin.recoveryCodes;

    const firstToken = await loginForMfaToken(admin);
    const first = await request(app).post('/api/v1/admin/auth/mfa/verify').send({ mfaToken: firstToken, recoveryCode });
    expect(first.status).toBe(200);
    const audit = await prisma.auditLog.findFirst({ where: { actorId: admin.id, action: 'admin.mfa.recovery_used' } });
    expect(audit).not.toBeNull();

    await flushRateLimits();
    const secondToken = await loginForMfaToken(admin);
    const second = await request(app).post('/api/v1/admin/auth/mfa/verify').send({ mfaToken: secondToken, recoveryCode });
    expect(second.status).toBe(401);
  });

  it('student credentials on /admin/auth/login get the generic 401', async () => {
    const student = await createStudentForAdminTests();

    const res = await request(app).post('/api/v1/admin/auth/login').send({ email: student.email, password: student.password });

    expect(res.status).toBe(401);
    expect(res.body.type).toBe('unauthenticated');
  });

  it('admin credentials on /auth/login (student login) get the generic 401', async () => {
    const admin = await createAdminWithTotp();

    const res = await request(app).post('/api/v1/auth/login').send({ email: admin.email, password: admin.password });

    expect(res.status).toBe(401);
    expect(res.body.type).toBe('unauthenticated');
  });

  it('TC-07: a student access token on another /admin/* path is rejected with 403, and no token with 401', async () => {
    const { createActiveUser, cleanupTestUsers } = await import('../../fixtures/auth.js');
    const student = await createActiveUser();
    const login = await request(app).post('/api/v1/auth/login').send({ email: student.email, password: student.password });

    const withStudentToken = await request(app)
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(withStudentToken.status).toBe(403);

    const withoutToken = await request(app).get('/api/v1/admin/users');
    expect(withoutToken.status).toBe(401);

    await cleanupTestUsers();
  });

  it('an mfaToken presented as a Bearer access token on a normal route is rejected with 401', async () => {
    const admin = await createAdminWithTotp();
    const mfaToken = await loginForMfaToken(admin);

    const res = await request(app).get('/api/v1/me').set('Authorization', `Bearer ${mfaToken}`);

    expect(res.status).toBe(401);
  });

  it(
    'security review: 3 rounds of (login -> 5 wrong TOTP) lock the account; the correct password ' +
      'alone never resets failedLoginCount before MFA succeeds',
    async () => {
      const admin = await createAdminWithTotp();
      const code = await generate({ secret: admin.secret });
      const wrongCode = code === '000000' ? '111111' : '000000';

      for (let round = 0; round < 3; round += 1) {
        const mfaToken = await loginForMfaToken(admin);

        // The correct password on this very login must not have reset the counter left over from
        // the previous round(s) — otherwise the lockout could be reset forever by re-entering the
        // (still-correct) password and the MFA step would have no effective attempt limit.
        const afterPassword = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } });
        expect(afterPassword.failedLoginCount).toBe(round * 5);

        for (let i = 0; i < 5; i += 1) {
          const res = await request(app).post('/api/v1/admin/auth/mfa/verify').send({ mfaToken, code: wrongCode });
          expect(res.status).toBe(401);
        }
        await flushRateLimits();
        // Simulate the previous lockout window having expired so the next round's login (password
        // step) can proceed far enough to mint a fresh mfaToken and keep failing MFA.
        if (round < 2) await prisma.user.update({ where: { id: admin.id }, data: { lockedUntil: null } });
      }

      const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } });
      expect(dbUser.lockedUntil).not.toBeNull();
      expect(dbUser.lockedUntil?.getTime()).toBeGreaterThan(Date.now());

      const lockAudit = await prisma.auditLog.findFirst({ where: { actorId: admin.id, action: 'auth.locked' } });
      expect(lockAudit).not.toBeNull();

      const lockedLogin = await request(app)
        .post('/api/v1/admin/auth/login')
        .send({ email: admin.email, password: admin.password });
      expect(lockedLogin.status).toBe(429);
      expect(lockedLogin.body.type).toBe('account-locked');
    },
    // P18: this test does 3 rounds x (1 login + 5 verify) = 18 sequential HTTP round-trips against
    // real MySQL/Redis/Argon2 — comfortably under 5s alone, but resource contention under the full
    // ~90-file parallel suite intermittently pushes it past Vitest's default 5000ms (documented in
    // PROGRESS.md P07/P11: not a code bug). Raised only for this test, not a global config change.
    15_000,
  );

  it(
    'security review A: a lock tripped on one mfaToken also blocks an already-issued, still-valid ' +
      'second mfaToken — the correct code on it gets 429 account-locked, no session created',
    async () => {
      const admin = await createAdminWithTotp();
      const code = await generate({ secret: admin.secret });
      const wrongCode = code === '000000' ? '111111' : '000000';

      // 3 admin logins up front -> 3 independent, still-valid mfaTokens for the same admin.
      const tokens = [
        await loginForMfaToken(admin),
        await loginForMfaToken(admin),
        await loginForMfaToken(admin),
      ];
      await flushRateLimits();

      for (let i = 0; i < 5; i += 1) {
        const res = await request(app).post('/api/v1/admin/auth/mfa/verify').send({ mfaToken: tokens[0], code: wrongCode });
        expect(res.status).toBe(401);
      }
      await flushRateLimits();

      const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } });
      expect(dbUser.lockedUntil).not.toBeNull();

      // The *correct* code on a different, still-unused, still-unexpired mfaToken must still fail.
      const secondRes = await request(app).post('/api/v1/admin/auth/mfa/verify').send({ mfaToken: tokens[1], code });
      expect(secondRes.status).toBe(429);
      expect(secondRes.body.type).toBe('account-locked');

      const failedAudit = await prisma.auditLog.findFirst({
        where: { actorId: admin.id, action: 'admin.mfa.failed' },
        orderBy: { id: 'desc' },
      });
      expect((failedAudit?.metadata as { reason?: string } | null)?.reason).toBe('locked');

      // No session was created by that "correct code, but locked" attempt.
      const sessionsCount = await prisma.refreshToken.count({ where: { userId: admin.id, revokedAt: null } });
      expect(sessionsCount).toBe(0);

      // A third, also still-valid token behaves the same way.
      const thirdRes = await request(app).post('/api/v1/admin/auth/mfa/verify').send({ mfaToken: tokens[2], code });
      expect(thirdRes.status).toBe(429);
      expect(thirdRes.body.type).toBe('account-locked');
    },
  );

  it('admin refresh works, then fails once the session has been idle for more than 30 minutes', async () => {
    const admin = await createAdminWithTotp();
    const mfaToken = await loginForMfaToken(admin);
    const code = await generate({ secret: admin.secret });
    const verifyRes = await request(app).post('/api/v1/admin/auth/mfa/verify').send({ mfaToken, code });
    const cookie = extractRefreshCookie(verifyRes.headers['set-cookie'] as unknown as string[]);

    const refreshed = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie).set(CSRF_HEADERS);
    expect(refreshed.status).toBe(200);
    const newCookie = extractRefreshCookie(refreshed.headers['set-cookie'] as unknown as string[]);
    const rawToken = decodeURIComponent(newCookie.split('=')[1] ?? '');

    // Simulate 31 minutes of idleness on the token that was just issued.
    await prisma.refreshToken.updateMany({
      where: { tokenHash: sha256Hex(rawToken) },
      data: { createdAt: new Date(Date.now() - 31 * 60 * 1000) },
    });

    const idleRefresh = await request(app).post('/api/v1/auth/refresh').set('Cookie', newCookie).set(CSRF_HEADERS);
    expect(idleRefresh.status).toBe(401);
  });
});
