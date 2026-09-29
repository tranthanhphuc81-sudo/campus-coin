/**
 * rateLimit.test.ts
 * Integration test for backend/src/middlewares/rateLimit.ts against a real Redis (skipped when
 * REDIS_URL is not set — same convention as tests/integration/db/seed.test.ts). Verifies the
 * limit is enforced and the resulting response is RFC 9457 `rate-limited` with `Retry-After`.
 * Spec: docs/spec/07 §7.4 (Table 46) · docs/spec/07 §7.2 (Table 41)
 */
import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { Role } from '@campuscoin/shared';
import { errorHandler } from '../../src/middlewares/errorHandler.js';
import { createRateLimiter, RATE_LIMIT_PRESETS, refreshCookieKey } from '../../src/middlewares/rateLimit.js';
import { redis } from '../../src/lib/redis.js';

describe.skipIf(!process.env.REDIS_URL)('createRateLimiter', () => {
  afterAll(async () => {
    await redis.quit();
  });

  function buildApp(max: number) {
    const app = express();
    app.use(createRateLimiter({ windowMs: 60_000, max, keyPrefix: `test-${randomUUID()}` }));
    app.get('/ping', (_req, res) => res.json({ pong: true }));
    app.use(errorHandler);
    return app;
  }

  it('allows requests under the limit and blocks the one that exceeds it', async () => {
    const app = buildApp(2);

    const first = await request(app).get('/ping');
    const second = await request(app).get('/ping');
    const third = await request(app).get('/ping');

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(429);
  });

  it('responds with application/problem+json and a Retry-After header once limited', async () => {
    const app = buildApp(1);

    await request(app).get('/ping');
    const res = await request(app).get('/ping');

    expect(res.status).toBe(429);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(res.body.type).toBe('rate-limited');
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  /** Builds an app whose default (no keyGenerator override) key comes from `X-Forwarded-For`. */
  function buildTrustProxyApp(max: number) {
    const app = express();
    app.set('trust proxy', true);
    app.use(createRateLimiter({ windowMs: 60_000, max, keyPrefix: `test-ipv6-${randomUUID()}` }));
    app.get('/ping', (_req, res) => res.json({ pong: true }));
    app.use(errorHandler);
    return app;
  }

  it('A-M1: two IPv6 addresses in the same /56 share one rate-limit bucket', async () => {
    const app = buildTrustProxyApp(1);

    const first = await request(app).get('/ping').set('X-Forwarded-For', '2001:db8:1234:5600::1');
    // Same top-56-bit prefix ("2001:0db8:1234:56xx") as the address above, different tail.
    const second = await request(app).get('/ping').set('X-Forwarded-For', '2001:db8:1234:56ff:ffff:ffff:ffff:ffff');

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
  });

  it('A-M1: two IPv6 addresses in different /56s get independent buckets', async () => {
    const app = buildTrustProxyApp(1);

    const first = await request(app).get('/ping').set('X-Forwarded-For', '2001:db8:1234:5600::1');
    const second = await request(app).get('/ping').set('X-Forwarded-For', '2001:db8:1234:5700::1');

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });

  it('P19 confirmation-review fix: a burst of cookie-less requests from one IP never blocks a DIFFERENT session (real cookie) sharing that IP', async () => {
    // Mirrors RATE_LIMIT_PRESETS.authRefreshLogout's shape (cookie-keyed + a much higher IP
    // backstop) with a tiny `max` so the test runs fast, rather than looping hundreds of times
    // against the real preset's actual thresholds.
    const app = express();
    app.set('trust proxy', true);
    app.use(
      createRateLimiter({ windowMs: 60_000, max: 2, keyPrefix: `test-refresh-cookie-${randomUUID()}`, keyGenerator: refreshCookieKey }),
      // No custom keyGenerator here: the default is the same IP-collapsing key the real
      // `authRefreshLogout`'s IP-backstop leg uses.
      createRateLimiter({ windowMs: 60_000, max: 5, keyPrefix: `test-refresh-ip-${randomUUID()}` }),
    );
    app.get('/refresh', (_req, res) => res.json({ ok: true }));
    app.use(errorHandler);

    // 5 cookie-less requests from the SAME IP: the first few share the `no-cookie:<ip>` bucket and
    // exhaust its (also small, here) cap, but must never touch a real session's own bucket.
    for (let i = 0; i < 5; i += 1) {
      await request(app).get('/refresh').set('X-Forwarded-For', '203.0.113.9');
    }

    // A real session (its own refresh cookie) behind the exact same IP must still succeed twice.
    const first = await request(app)
      .get('/refresh')
      .set('X-Forwarded-For', '203.0.113.9')
      .set('Cookie', 'cc_rt=some-real-refresh-token-value');
    const second = await request(app)
      .get('/refresh')
      .set('X-Forwarded-For', '203.0.113.9')
      .set('Cookie', 'cc_rt=some-real-refresh-token-value');

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });

  it('B-M4: RATE_LIMIT_PRESETS.reportsExport is a 10/min, per-user-keyed preset', async () => {
    expect(RATE_LIMIT_PRESETS.reportsExport).toHaveLength(1);

    const app = express();
    app.use((req, _res, next) => {
      req.auth = { userId: 'user-under-test', role: Role.STUDENT, sessionId: 's1' };
      next();
    });
    app.use(...RATE_LIMIT_PRESETS.reportsExport);
    app.get('/export', (_req, res) => res.json({ ok: true }));
    app.use(errorHandler);

    for (let i = 0; i < 10; i += 1) {
      const res = await request(app).get('/export');
      expect(res.status).toBe(200);
    }
    const eleventh = await request(app).get('/export');
    expect(eleventh.status).toBe(429);
  });
});
