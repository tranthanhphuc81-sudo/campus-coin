/**
 * password-reset.test.ts
 * Integration tests for `POST /api/v1/auth/forgot-password` and `/reset-password` against real
 * MySQL + Redis (skipped without DATABASE_URL). Covers no-user-enumeration (identical 202 for a
 * known vs. unknown email, email only queued for the known one), TC-05 (single-use, expired
 * token, old sessions die, login works with the new password, a new link invalidates the
 * previous one), and TC-28 (rate limit on repeated forgot-password calls).
 * Spec: docs/spec/09 §9.1–9.5 · Rules: BR-AU-02, BR-AU-03, BR-AU-06
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const queueEmailMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../src/integrations/mailer/index.js', () => ({ queueEmail: queueEmailMock }));

const { createApp } = await import('../../../src/app.js');
const { config } = await import('../../../src/config/env.js');
const { prisma } = await import('../../../src/lib/prisma.js');
const { AuthTokenPurpose } = await import('../../../src/generated/prisma/enums.js');
const { createActiveUser, cleanupTestUsers, flushRateLimits, KEEP_RATE_LIMIT_PREFIX, STRONG_PASSWORD, uniqueEmail } =
  await import(
  '../../fixtures/auth.js'
);

const ORIGIN = config.app.corsOrigins[0] ?? 'http://localhost:5174';
const CSRF_HEADERS = { Origin: ORIGIN, 'X-Requested-With': 'XMLHttpRequest' };

/** Pulls the `token=` query value out of an emailed reset-password link. */
function extractToken(text: string): string {
  const match = /token=([^\s&]+)/.exec(text);
  if (!match?.[1]) throw new Error(`No token found in email text: ${text}`);
  return match[1];
}

describe.skipIf(!process.env.DATABASE_URL)('POST /api/v1/auth/forgot-password and /reset-password', () => {
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

  it('unknown and known email get the identical 202 body; only the known one queues an email', async () => {
    const user = await createActiveUser();

    const unknown = await request(app).post('/api/v1/auth/forgot-password').send({ email: uniqueEmail() });
    expect(queueEmailMock).not.toHaveBeenCalled();

    const known = await request(app).post('/api/v1/auth/forgot-password').send({ email: user.email });

    expect(unknown.status).toBe(202);
    expect(known.status).toBe(202);
    expect(unknown.body).toEqual(known.body);
    expect(queueEmailMock).toHaveBeenCalledTimes(1);
  });

  it('a pending (unverified) account does not receive a reset email either', async () => {
    const email = uniqueEmail();
    const { hashPassword } = await import('../../../src/lib/password.js');
    const { trackUserForCleanup } = await import('../../fixtures/auth.js');
    const created = await prisma.user.create({
      data: { email, passwordHash: await hashPassword(STRONG_PASSWORD), fullName: 'Pending User' },
    });
    trackUserForCleanup(created.id);

    const res = await request(app).post('/api/v1/auth/forgot-password').send({ email });

    expect(res.status).toBe(202);
    expect(queueEmailMock).not.toHaveBeenCalled();
  });

  it('TC-05: resets the password once; a second use or an expired token is rejected', async () => {
    const user = await createActiveUser();
    await request(app).post('/api/v1/auth/forgot-password').send({ email: user.email });
    const link = queueEmailMock.mock.calls[0]?.[0]?.text as string;
    const token = extractToken(link);

    const weak = await request(app).post('/api/v1/auth/reset-password').send({ token, newPassword: 'basketball' });
    expect(weak.status).toBe(422);

    const newPassword = 'zQ7!vBn4pR9x-Turing2026';
    const reset = await request(app).post('/api/v1/auth/reset-password').send({ token, newPassword });
    expect(reset.status).toBe(200);

    // Second use of the same (now-consumed) token is rejected.
    const reuse = await request(app).post('/api/v1/auth/reset-password').send({ token, newPassword });
    expect(reuse.status).toBe(400);
    expect(reuse.body.type).toBe('invalid-token');

    // Login with the new password works.
    const login = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: newPassword });
    expect(login.status).toBe(200);

    // Login with the old password no longer works.
    const oldLogin = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: user.password });
    expect(oldLogin.status).toBe(401);
  });

  it('TC-05: an expired token is rejected with invalid-token', async () => {
    const user = await createActiveUser();
    await request(app).post('/api/v1/auth/forgot-password').send({ email: user.email });
    const link = queueEmailMock.mock.calls[0]?.[0]?.text as string;
    const token = extractToken(link);
    const { sha256Hex } = await import('../../../src/lib/tokens.js');
    await prisma.authToken.updateMany({
      where: { userId: user.id, purpose: AuthTokenPurpose.reset_password, tokenHash: sha256Hex(token) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token, newPassword: 'zQ7!vBn4pR9x-Turing2026' });

    expect(res.status).toBe(400);
    expect(res.body.type).toBe('invalid-token');
  });

  it('after a reset, the old refresh token and access token are revoked (BR-AU-06)', async () => {
    const user = await createActiveUser();
    const login = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: user.password });
    const accessToken = login.body.accessToken as string;
    const setCookie = login.headers['set-cookie'] as unknown as string[];
    const cookie = setCookie.find((c) => c.startsWith('cc_rt='))?.split(';')[0] ?? '';

    await request(app).post('/api/v1/auth/forgot-password').send({ email: user.email });
    const link = queueEmailMock.mock.calls[0]?.[0]?.text as string;
    const token = extractToken(link);
    const newPassword = 'zQ7!vBn4pR9x-Turing2026';
    await request(app).post('/api/v1/auth/reset-password').send({ token, newPassword });

    const refreshAfter = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie).set(CSRF_HEADERS);
    expect(refreshAfter.status).toBe(401);

    const { authenticate } = await import('../../../src/middlewares/authenticate.js');
    const { errorHandler } = await import('../../../src/middlewares/errorHandler.js');
    const express = (await import('express')).default;
    const miniApp = express();
    miniApp.use(authenticate);
    miniApp.get('/protected', (req, res) => res.json({ userId: req.auth?.userId }));
    miniApp.use(errorHandler);
    const protectedAfter = await request(miniApp).get('/protected').set('Authorization', `Bearer ${accessToken}`);
    expect(protectedAfter.status).toBe(401);
  });

  it('requesting a new reset link invalidates the previous one', async () => {
    const user = await createActiveUser();

    await request(app).post('/api/v1/auth/forgot-password').send({ email: user.email });
    const firstLink = queueEmailMock.mock.calls[0]?.[0]?.text as string;
    const firstToken = extractToken(firstLink);

    await request(app).post('/api/v1/auth/forgot-password').send({ email: user.email });

    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: firstToken, newPassword: 'zQ7!vBn4pR9x-Turing2026' });

    expect(res.status).toBe(400);
    expect(res.body.type).toBe('invalid-token');
  });

  it('TC-28: the 4th forgot-password call for the same email+IP within the hour is rate-limited (429, Retry-After)', async () => {
    // Marked email: parallel test files' flushRateLimits() must not reset this counter mid-test.
    const user = await createActiveUser({ email: uniqueEmail(KEEP_RATE_LIMIT_PREFIX) });

    let last;
    for (let i = 0; i < 4; i += 1) {
      last = await request(app).post('/api/v1/auth/forgot-password').send({ email: user.email });
    }

    expect(last?.status).toBe(429);
    expect(last?.headers['retry-after']).toBeDefined();
  });

  it('security review 3: email-key normalisation matches emailSchema — variants share one rate-limit bucket', async () => {
    // Marked email: parallel test files' flushRateLimits() must not reset this counter mid-test.
    const email = uniqueEmail(KEEP_RATE_LIMIT_PREFIX);
    const user = await createActiveUser({ email });
    const variants = [user.email, ` ${user.email}`, `${user.email} `, `${user.email.toUpperCase()}\t`];

    let last;
    for (const variant of variants) {
      last = await request(app).post('/api/v1/auth/forgot-password').send({ email: variant });
    }

    expect(last?.status).toBe(429);
    expect(last?.headers['retry-after']).toBeDefined();
  });
});
