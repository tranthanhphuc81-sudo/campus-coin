/**
 * security-headers.test.ts
 * Integration test for backend/src/middlewares/security.ts (A-L9): asserts the CSP header sent to
 * the client matches docs/spec/09 §9.11 Table 57 exactly — no implicit helmet defaults (e.g.
 * `font-src`) leak in, and `object-src 'none'` is present.
 * Spec: docs/spec/09 §9.11 (Table 57)
 */
import express, { type Express } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { securityHeaders } from '../../../src/middlewares/security.js';

function buildApp(): Express {
  const app = express();
  app.use(securityHeaders);
  app.get('/ping', (_req, res) => res.json({ pong: true }));
  return app;
}

describe('securityHeaders (CSP, Table 57)', () => {
  it('sends every Table 57 directive and object-src none, with no helmet-default directives merged in', async () => {
    const res = await request(buildApp()).get('/ping');

    const csp = res.headers['content-security-policy'] as string;
    expect(csp).toBeTruthy();

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' https://embed.tawk.to");
    expect(csp).toContain("connect-src 'self' https://*.tawk.to wss://*.tawk.to");
    expect(csp).toContain("img-src 'self' data: https://*.tawk.to");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain('frame-src https://tawk.to');
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("object-src 'none'");

    // A-L9: `useDefaults: false` means helmet's own default directives (e.g. its default
    // `font-src 'self' https: data:`) must never appear — they were never declared above.
    expect(csp).not.toContain('font-src');
    expect(csp).not.toContain('script-src-attr');
  });

  it('sets Permissions-Policy denying camera/microphone/geolocation/payment', async () => {
    const res = await request(buildApp()).get('/ping');
    expect(res.headers['permissions-policy']).toBe('camera=(), microphone=(), geolocation=(), payment=()');
  });

  it('sets the remaining Table 57 headers (HSTS, nosniff, Referrer-Policy, COOP) and hides X-Powered-By', async () => {
    const res = await request(buildApp()).get('/ping');

    expect(res.headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains; preload');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(res.headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
