/**
 * login.test.ts
 * Integration tests for `POST /api/v1/auth/login` against real MySQL + Redis. Covers success
 * (token + refresh cookie shape/flags, "remember me" Max-Age), a pending (unverified) account
 * (403 email-not-verified), unknown email vs. wrong password returning an identical 401 body
 * (no user-enumeration), and TC-03 (lockout after 5 failed attempts, 429 account-locked with
 * ~15 min Retry-After, a lockout email queued, and an `auth.locked` audit row).
 * Spec: docs/spec/09 §9.5 · Rules: BR-AU-02..04
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const queueEmailMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../src/integrations/mailer/index.js', () => ({ queueEmail: queueEmailMock }));

const { createApp } = await import('../../../src/app.js');
const { prisma } = await import('../../../src/lib/prisma.js');
const { createActiveUser, cleanupTestUsers, flushRateLimits, uniqueEmail } = await import('../../fixtures/auth.js');

describe.skipIf(!process.env.DATABASE_URL)('POST /api/v1/auth/login', () => {
  const app = createApp();

  beforeEach(async () => {
    await flushRateLimits();
    queueEmailMock.mockClear();
  });

  afterEach(async () => {
    await cleanupTestUsers();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('logs in with correct credentials: access token + user DTO + refresh cookie (HttpOnly, Secure, SameSite=Strict, ~7d)', async () => {
    const user = await createActiveUser();

    const res = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: user.password });

    expect(res.status).toBe(200);
    expect(res.body.tokenType).toBe('Bearer');
    expect(typeof res.body.accessToken).toBe('string');
    expect(res.body.user.email).toBe(user.email);
    expect(res.body.user.passwordHash).toBeUndefined();

    const setCookie = res.headers['set-cookie'] as unknown as string[];
    const cookie = setCookie.find((c) => c.startsWith('cc_rt='));
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
    const maxAgeMatch = /Max-Age=(\d+)/.exec(cookie ?? '');
    const maxAge = Number(maxAgeMatch?.[1]);
    expect(maxAge).toBeGreaterThan(6 * 24 * 60 * 60);
    expect(maxAge).toBeLessThanOrEqual(7 * 24 * 60 * 60);
  });

  it('rememberMe=true issues a ~30 day cookie instead of ~7 day', async () => {
    const user = await createActiveUser();

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: user.password, rememberMe: true });

    const setCookie = res.headers['set-cookie'] as unknown as string[];
    const cookie = setCookie.find((c) => c.startsWith('cc_rt='));
    const maxAge = Number(/Max-Age=(\d+)/.exec(cookie ?? '')?.[1]);
    expect(maxAge).toBeGreaterThan(29 * 24 * 60 * 60);
  });

  it('rejects a pending (unverified) account with 403 email-not-verified', async () => {
    const email = uniqueEmail();
    const { hashPassword } = await import('../../../src/lib/password.js');
    const { STRONG_PASSWORD, trackUserForCleanup } = await import('../../fixtures/auth.js');
    const created = await prisma.user.create({
      data: { email, passwordHash: await hashPassword(STRONG_PASSWORD), fullName: 'Pending User' },
    });
    trackUserForCleanup(created.id);

    const res = await request(app).post('/api/v1/auth/login').send({ email, password: STRONG_PASSWORD });

    expect(res.status).toBe(403);
    expect(res.body.type).toBe('email-not-verified');
  });

  it('unknown email and wrong password return the identical generic 401 body', async () => {
    const user = await createActiveUser();

    const unknown = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: uniqueEmail(), password: 'whatever-Password123' });
    const wrong = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: 'wrongWrong123!' });

    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    // Same shape except `requestId`, which is unique per request by design.
    const { requestId: _unknownId, ...unknownRest } = unknown.body;
    const { requestId: _wrongId, ...wrongRest } = wrong.body;
    expect(unknownRest).toEqual(wrongRest);
  });

  it('security review: a 400-char User-Agent on a wrong-password login still audits with user_agent length <= 255', async () => {
    const user = await createActiveUser();
    const longUserAgent = 'A'.repeat(400);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('User-Agent', longUserAgent)
      .send({ email: user.email, password: 'wrong-Password!!' });

    expect(res.status).toBe(401);

    const audit = await prisma.auditLog.findFirst({
      where: { actorId: user.id, action: 'auth.login.failed' },
      orderBy: { id: 'desc' },
    });
    expect(audit).not.toBeNull();
    expect((audit?.userAgent ?? '').length).toBeLessThanOrEqual(255);
  });

  it('TC-03: locks the account after 5 failed attempts (429 account-locked, ~15 min Retry-After, lockout email + audit)', async () => {
    const user = await createActiveUser();

    for (let i = 0; i < 5; i += 1) {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: 'wrong-Password!!' });
      expect(res.status).toBe(401);
    }

    // The per-IP+email login rate limiter (5/min) would otherwise shadow the lockout on this 6th
    // request — flush it so this test observes the *account* lock, not the rate limiter.
    await flushRateLimits();

    const locked = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: user.password });

    expect(locked.status).toBe(429);
    expect(locked.body.type).toBe('account-locked');
    const retryAfter = Number(locked.headers['retry-after']);
    expect(retryAfter).toBeGreaterThan(800);
    expect(retryAfter).toBeLessThanOrEqual(900);

    const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(dbUser.lockedUntil).not.toBeNull();

    expect(queueEmailMock).toHaveBeenCalled();

    const lockAudit = await prisma.auditLog.findFirst({ where: { actorId: user.id, action: 'auth.locked' } });
    expect(lockAudit).not.toBeNull();
  });

  it('A-M3: an already-locked known account audits auth.login.failed with reason "locked" on every subsequent attempt', async () => {
    const user = await createActiveUser();

    for (let i = 0; i < 5; i += 1) {
      await request(app).post('/api/v1/auth/login').send({ email: user.email, password: 'wrong-Password!!' });
    }
    await flushRateLimits();

    const locked = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: user.password });
    expect(locked.status).toBe(429);

    const failedAudit = await prisma.auditLog.findFirst({
      where: { actorId: user.id, action: 'auth.login.failed' },
      orderBy: { id: 'desc' },
    });
    expect((failedAudit?.metadata as { reason?: string } | null)?.reason).toBe('locked');
  });

  it('A-M3: an unknown email is shadow-locked after 5 attempts (same 429 account-locked as a real account)', async () => {
    const email = uniqueEmail();

    for (let i = 0; i < 5; i += 1) {
      const res = await request(app).post('/api/v1/auth/login').send({ email, password: 'whatever-Password123' });
      expect(res.status).toBe(401);
    }
    await flushRateLimits();

    const sixth = await request(app).post('/api/v1/auth/login').send({ email, password: 'whatever-Password123' });

    expect(sixth.status).toBe(429);
    expect(sixth.body.type).toBe('account-locked');
    const retryAfter = Number(sixth.headers['retry-after']);
    expect(retryAfter).toBeGreaterThan(800);
    expect(retryAfter).toBeLessThanOrEqual(900);
  });
});
