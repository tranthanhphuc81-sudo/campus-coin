/**
 * register.test.ts
 * Integration tests for `POST /api/v1/auth/register`, `/verify-email` and `/resend-verification`
 * against real MySQL + Redis (skipped without DATABASE_URL). `queueEmail` is mocked so no real
 * SMTP call happens; the mock capture lets tests pull the verification token out of the link.
 * Covers TC-01 (new signup), TC-02 (duplicate email — identical response), mass assignment and
 * weak-password rejection.
 * Spec: docs/spec/07 §7.3.1 · docs/spec/09 §9.1 · Rules: BR-AU-01..03
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const queueEmailMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../src/integrations/mailer/index.js', () => ({ queueEmail: queueEmailMock }));

const { createApp } = await import('../../../src/app.js');
const { prisma } = await import('../../../src/lib/prisma.js');
const { cleanupTestUsers, flushRateLimits, STRONG_PASSWORD, trackUserForCleanup, uniqueEmail } = await import(
  '../../fixtures/auth.js'
);

/** Pulls the `token=` query value out of an emailed verify-email link. */
function extractToken(text: string): string {
  const match = /token=([^\s&]+)/.exec(text);
  if (!match?.[1]) throw new Error(`No token found in email text: ${text}`);
  return match[1];
}

describe.skipIf(!process.env.DATABASE_URL)('POST /api/v1/auth/register', () => {
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

  it('TC-01: registers a new account, queues a verify email, and the token activates it once', async () => {
    const email = uniqueEmail();

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ fullName: 'Ada Lovelace', email, password: STRONG_PASSWORD });

    expect(res.status).toBe(202);
    expect(res.body.message).toMatch(/check your inbox/i);
    expect(queueEmailMock).toHaveBeenCalledTimes(1);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    trackUserForCleanup(user.id);
    expect(user.status).toBe('pending');
    expect(user.role).toBe('student');

    const link = queueEmailMock.mock.calls[0]?.[0]?.text as string;
    const token = extractToken(link);

    const verifyRes = await request(app).post('/api/v1/auth/verify-email').send({ token });
    expect(verifyRes.status).toBe(200);

    const activated = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(activated.status).toBe('active');
    expect(activated.emailVerifiedAt).not.toBeNull();

    // Single-use: the same token cannot verify again.
    const secondVerify = await request(app).post('/api/v1/auth/verify-email').send({ token });
    expect(secondVerify.status).toBe(400);
    expect(secondVerify.body.type).toBe('invalid-token');
  });

  it('TC-02: registering with an already-active email returns the identical response, no new user', async () => {
    const email = uniqueEmail();
    const before = await request(app)
      .post('/api/v1/auth/register')
      .send({ fullName: 'Grace Hopper', email, password: STRONG_PASSWORD });
    const activeUser = await prisma.user.findUniqueOrThrow({ where: { email } });
    trackUserForCleanup(activeUser.id);
    await prisma.user.update({ where: { id: activeUser.id }, data: { status: 'active', emailVerifiedAt: new Date() } });

    queueEmailMock.mockClear();
    const after = await request(app)
      .post('/api/v1/auth/register')
      .send({ fullName: 'Someone Else', email, password: STRONG_PASSWORD });

    expect(after.status).toBe(before.status);
    expect(after.body).toEqual(before.body);
    expect(queueEmailMock).toHaveBeenCalledTimes(1); // "account already exists" email, not a new verify link

    const count = await prisma.user.count({ where: { email } });
    expect(count).toBe(1);
  });

  it(
    'security review B: re-registering a still-pending email never changes its password — the ' +
      'victim finishes sign-up via the emailed link with their own chosen password',
    async () => {
      const email = uniqueEmail();
      const victimPassword = STRONG_PASSWORD;
      const attackerPassword = 'zQ7!vBn4pR9x-AttackerTry';

      const victimRegister = await request(app)
        .post('/api/v1/auth/register')
        .send({ fullName: 'Victim', email, password: victimPassword });
      expect(victimRegister.status).toBe(202);
      const pendingUser = await prisma.user.findUniqueOrThrow({ where: { email } });
      trackUserForCleanup(pendingUser.id);
      expect(pendingUser.status).toBe('pending');
      const originalHash = pendingUser.passwordHash;

      const victimVerifyLink = queueEmailMock.mock.calls[0]?.[0]?.text as string;
      const victimVerifyToken = extractToken(victimVerifyLink);

      queueEmailMock.mockClear();
      const attackerRegister = await request(app)
        .post('/api/v1/auth/register')
        .send({ fullName: 'Attacker', email, password: attackerPassword });
      expect(attackerRegister.status).toBe(202);
      expect(queueEmailMock).toHaveBeenCalledTimes(1); // a fresh "finish sign-up" email, not "account exists"

      // Still one row; the stored hash is untouched by the attacker's register call.
      const count = await prisma.user.count({ where: { email } });
      expect(count).toBe(1);
      const afterAttackerRegister = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(afterAttackerRegister.passwordHash).toBe(originalHash);
      expect(afterAttackerRegister.fullName).toBe('Victim');
      expect(afterAttackerRegister.status).toBe('pending');

      // The victim's original verify-email link is now invalidated (re-registration invalidates it).
      const staleVerify = await request(app).post('/api/v1/auth/verify-email').send({ token: victimVerifyToken });
      expect(staleVerify.status).toBe(400);
      expect(staleVerify.body.type).toBe('invalid-token');

      // The victim uses the *finish sign-up* link (a reset_password token) to choose their password.
      const finishSignUpLink = queueEmailMock.mock.calls[0]?.[0]?.text as string;
      const finishSignUpToken = extractToken(finishSignUpLink);
      const finish = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token: finishSignUpToken, newPassword: victimPassword });
      expect(finish.status).toBe(200);

      const activated = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(activated.status).toBe('active');
      expect(activated.emailVerifiedAt).not.toBeNull();

      const loginVictim = await request(app).post('/api/v1/auth/login').send({ email, password: victimPassword });
      expect(loginVictim.status).toBe(200);

      const loginAttacker = await request(app).post('/api/v1/auth/login').send({ email, password: attackerPassword });
      expect(loginAttacker.status).toBe(401);
    },
  );

  it('rejects mass assignment of role — 422, no user created', async () => {
    const email = uniqueEmail();
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ fullName: 'Eve Attacker', email, password: STRONG_PASSWORD, role: 'admin' });

    expect(res.status).toBe(422);
    expect(res.body.type).toBe('validation-failed');
    await expect(prisma.user.findUnique({ where: { email } })).resolves.toBeNull();
  });

  it('rejects a weak/common password — 422, no user created', async () => {
    const email = uniqueEmail();
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ fullName: 'Weak Password', email, password: 'basketball' });

    expect(res.status).toBe(422);
    expect(res.body.errors?.[0]?.field).toBe('password');
    await expect(prisma.user.findUnique({ where: { email } })).resolves.toBeNull();
  });
});
