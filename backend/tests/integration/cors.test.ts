/**
 * cors.test.ts
 * Integration tests for backend/src/middlewares/cors.ts (security review item 11): an OPTIONS
 * preflight on a credentialed prefix (`/api/v1/auth/*`) from an allowed origin must be answered
 * by `corsWithCredentials` (Access-Control-Allow-Credentials: true), and a disallowed origin must
 * get no CORS headers without ever 500ing. Runs against `createApp()` directly — no DB/Redis
 * needed, since a CORS preflight never reaches a route handler.
 * Spec: docs/spec/09 §9.11 (Table 57) · docs/spec/04 §4.2 (middleware order)
 */
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { config } from '../../src/config/env.js';

describe('CORS preflight on a credentialed prefix', () => {
  const app = createApp();
  const allowedOrigin = config.app.corsOrigins[0] ?? 'http://localhost:5174';

  it('an allowed origin gets Access-Control-Allow-Credentials: true on /api/v1/auth/refresh', async () => {
    const res = await request(app)
      .options('/api/v1/auth/refresh')
      .set('Origin', allowedOrigin)
      .set('Access-Control-Request-Method', 'POST');

    expect(res.headers['access-control-allow-origin']).toBe(allowedOrigin);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('a disallowed origin gets no ACAO header and never a 500', async () => {
    const res = await request(app)
      .options('/api/v1/auth/refresh')
      .set('Origin', 'https://evil.example.com')
      .set('Access-Control-Request-Method', 'POST');

    expect(res.status).not.toBe(500);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('the admin auth prefix behaves the same way', async () => {
    const res = await request(app)
      .options('/api/v1/admin/auth/login')
      .set('Origin', allowedOrigin)
      .set('Access-Control-Request-Method', 'POST');

    expect(res.headers['access-control-allow-origin']).toBe(allowedOrigin);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });
});
