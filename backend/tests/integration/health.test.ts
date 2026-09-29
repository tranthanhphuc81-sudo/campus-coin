/**
 * health.test.ts
 * Integration tests for GET /api/v1/health/live (always) and /ready (needs a real MySQL + Redis,
 * so it is skipped when DATABASE_URL/REDIS_URL are not set — same convention as
 * tests/integration/db/seed.test.ts).
 * Spec: docs/spec/10 §10.5 (availability) · docs/spec/12 (testing plan)
 */
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';

describe('GET /api/v1/health/live', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(createApp()).get('/api/v1/health/live');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('does not expose the X-Powered-By header', async () => {
    const res = await request(createApp()).get('/api/v1/health/live');

    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('sets Cache-Control: no-store', async () => {
    const res = await request(createApp()).get('/api/v1/health/live');

    expect(res.headers['cache-control']).toBe('no-store');
  });
});

describe.skipIf(!process.env.DATABASE_URL || !process.env.REDIS_URL)('GET /api/v1/health/ready', () => {
  it('returns 200 with both checks ok when MySQL and Redis are reachable', async () => {
    const res = await request(createApp()).get('/api/v1/health/ready');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', checks: { db: 'ok', redis: 'ok' } });
  });
});
