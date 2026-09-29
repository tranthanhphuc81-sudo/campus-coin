/**
 * me.test.ts
 * Integration tests for `GET /api/v1/me`, `PATCH /api/v1/me` and `PATCH /api/v1/me/password`
 * against real MySQL + Redis (skipped without DATABASE_URL). Covers the happy path (money
 * strings round-trip, HTML stripped from `fullName`), mass-assignment rejection (`role`/`status`
 * in the body), invalid timezone, and the password-change flow (wrong current password, and
 * that changing the password keeps the current session but signs out other sessions).
 * Spec: docs/spec/05a §5.2 (Table 15) · docs/spec/07 §7.3.1 · Rules: BR-AU-01, BR-AU-02, BR-AU-06
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const queueEmailMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../src/integrations/mailer/index.js', () => ({ queueEmail: queueEmailMock }));

const { createApp } = await import('../../../src/app.js');
const { prisma } = await import('../../../src/lib/prisma.js');
const { createActiveUser, cleanupTestUsers, flushRateLimits } = await import('../../fixtures/auth.js');

/** Extracts the `cc_rt` refresh cookie value from a Set-Cookie header array. */
function extractRefreshCookie(setCookie: string[]): string {
  const raw = setCookie.find((c) => c.startsWith('cc_rt='));
  if (!raw) throw new Error('cc_rt cookie not found');
  return raw.split(';')[0] ?? '';
}

describe.skipIf(!process.env.DATABASE_URL)('/api/v1/me', () => {
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

  async function loginAs() {
    const user = await createActiveUser();
    const login = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: user.password });
    return {
      user,
      accessToken: login.body.accessToken as string,
      cookie: extractRefreshCookie(login.headers['set-cookie'] as unknown as string[]),
    };
  }

  it('GET /me returns the caller\'s own profile', async () => {
    const { user, accessToken } = await loginAs();

    const res = await request(app).get('/api/v1/me').set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.email).toBe(user.email);
    expect(res.body.passwordHash).toBeUndefined();
  });

  it('GET /me without a token is 401', async () => {
    const res = await request(app).get('/api/v1/me');
    expect(res.status).toBe(401);
  });

  it('PATCH /me updates whitelisted fields: money strings round-trip, HTML is stripped from fullName', async () => {
    const { accessToken, user } = await loginAs();

    const res = await request(app)
      .patch('/api/v1/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fullName: '<b>Ada</b> Lovelace', monthlyAllowanceBaseline: '150.50', currency: 'USD' });

    expect(res.status).toBe(200);
    expect(res.body.fullName).toBe('Ada Lovelace');
    expect(res.body.monthlyAllowanceBaseline).toBe('150.50');

    const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(dbUser.fullName).toBe('Ada Lovelace');
  });

  it('PATCH /me updates every whitelisted field at once, then clears the two money fields with null', async () => {
    const { accessToken } = await loginAs();

    const full = await request(app)
      .patch('/api/v1/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        fullName: 'Grace Hopper',
        academicYear: 'year_3',
        monthlyAllowanceBaseline: '200.00',
        monthlySavingsGoal: '50.00',
        currency: 'USD',
        timezone: 'America/New_York',
        preferences: { theme: 'dark', fontScale: 1.1 },
        aiOptIn: false,
      });
    expect(full.status).toBe(200);
    expect(full.body).toMatchObject({
      fullName: 'Grace Hopper',
      academicYear: 'year_3',
      monthlyAllowanceBaseline: '200.00',
      monthlySavingsGoal: '50.00',
      aiOptIn: false,
    });

    const cleared = await request(app)
      .patch('/api/v1/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ monthlyAllowanceBaseline: null, monthlySavingsGoal: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.monthlyAllowanceBaseline).toBeNull();
    expect(cleared.body.monthlySavingsGoal).toBeNull();
    // A second, partial preferences update only touches the given key (theme untouched from above).
    const partialPrefs = await request(app)
      .patch('/api/v1/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ preferences: { fontScale: 1.25 } });
    expect(partialPrefs.status).toBe(200);
  });

  it('PATCH /me rejects mass assignment (role/status) with 422, DB unchanged', async () => {
    const { accessToken, user } = await loginAs();

    const res = await request(app)
      .patch('/api/v1/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ role: 'admin', status: 'active' });

    expect(res.status).toBe(422);
    const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(dbUser.role).toBe('student');
    expect(dbUser.email).toBe(user.email);
  });

  it('PATCH /me rejects an invalid timezone with 422', async () => {
    const { accessToken } = await loginAs();

    const res = await request(app)
      .patch('/api/v1/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ timezone: 'Not/A_Real_Zone' });

    expect(res.status).toBe(422);
  });

  it('PATCH /me/password rejects a wrong current password with 422', async () => {
    const { accessToken } = await loginAs();

    const res = await request(app)
      .patch('/api/v1/me/password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: 'totally-wrong-Password1', newPassword: 'zQ7!vBn4pR9x-Ada2026' });

    expect(res.status).toBe(422);
    expect(res.body.errors?.[0]?.field).toBe('currentPassword');
  });

  it('security review 5: the 6th wrong currentPassword attempt is 429 account-locked (lockout shared with login)', async () => {
    const { accessToken, user } = await loginAs();

    for (let i = 0; i < 5; i += 1) {
      const res = await request(app)
        .patch('/api/v1/me/password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ currentPassword: 'totally-wrong-Password1', newPassword: 'zQ7!vBn4pR9x-Ada2026' });
      expect(res.status).toBe(422);
    }

    // Flush the dedicated PATCH /me/password rate-limit bucket (5/15min) so this 6th call exercises
    // the *account-lock* check specifically, not the rate limiter (that's covered separately).
    const { redis } = await import('../../../src/lib/redis.js');
    const rlKeys = await redis.keys('rl:change-password:*');
    if (rlKeys.length > 0) await redis.del(...rlKeys);

    const sixth = await request(app)
      .patch('/api/v1/me/password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: 'totally-wrong-Password1', newPassword: 'zQ7!vBn4pR9x-Ada2026' });

    expect(sixth.status).toBe(429);
    expect(sixth.body.type).toBe('account-locked');

    const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(dbUser.lockedUntil).not.toBeNull();
  });

  it('PATCH /me/password succeeds: the current session keeps working, other sessions are signed out', async () => {
    const { accessToken, cookie, user } = await loginAs();
    // A second login = a second session/device.
    const otherLogin = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: user.password });
    const otherCookie = extractRefreshCookie(otherLogin.headers['set-cookie'] as unknown as string[]);

    const res = await request(app)
      .patch('/api/v1/me/password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: user.password, newPassword: 'zQ7!vBn4pR9x-Ada2026' });

    expect(res.status).toBe(204);
    expect(queueEmailMock).toHaveBeenCalled();

    // The current session's own access token still works.
    const me = await request(app).get('/api/v1/me').set('Authorization', `Bearer ${accessToken}`);
    expect(me.status).toBe(200);

    // The current session's refresh cookie still works too.
    const ORIGIN_HEADERS = { Origin: (await import('../../../src/config/env.js')).config.app.corsOrigins[0], 'X-Requested-With': 'x' };
    const refreshCurrent = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie).set(ORIGIN_HEADERS);
    expect(refreshCurrent.status).toBe(200);

    // The other session's refresh token no longer works.
    const refreshOther = await request(app).post('/api/v1/auth/refresh').set('Cookie', otherCookie).set(ORIGIN_HEADERS);
    expect(refreshOther.status).toBe(401);
  });
});
