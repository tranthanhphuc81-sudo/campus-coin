/**
 * rateLimit.passOnStoreError.test.ts
 * Unit test for `createRateLimiter`'s `passOnStoreError` option (A-L5): mocks the Redis client
 * entirely (no real Redis needed) so the store always fails, then asserts the two configured
 * behaviours — fail-open (`true`, the default, used by general presets) vs fail-closed (`false`,
 * used by every auth-related preset) — actually differ.
 * Spec: docs/spec/07 §7.4 (Table 46) · docs/spec/10 §10.5 (graceful degradation)
 */
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../src/middlewares/errorHandler.js';

// The store's `sendCommand` calls `redis.call(...)` — reject every call so every limiter built in
// this file behaves as if Redis were unreachable, without needing a real Redis connection.
const callMock = vi.fn().mockRejectedValue(new Error('redis unreachable'));
vi.mock('../../../src/lib/redis.js', () => ({ redis: { call: callMock } }));

const { createRateLimiter } = await import('../../../src/middlewares/rateLimit.js');

function buildApp(passOnStoreError?: boolean): express.Express {
  const app = express();
  app.use(createRateLimiter({ windowMs: 60_000, max: 5, keyPrefix: 'test-store-fail', passOnStoreError }));
  app.get('/ping', (_req, res) => res.json({ pong: true }));
  app.use(errorHandler);
  return app;
}

describe('createRateLimiter passOnStoreError (A-L5)', () => {
  it('defaults to fail-open: a broken store still lets the request through (general presets)', async () => {
    const res = await request(buildApp()).get('/ping');
    expect(res.status).toBe(200);
    expect(res.body.pong).toBe(true);
  });

  it('passOnStoreError:false fails the request instead of silently disabling the limit (auth presets)', async () => {
    const res = await request(buildApp(false)).get('/ping');
    expect(res.status).toBe(500);
  });
});
