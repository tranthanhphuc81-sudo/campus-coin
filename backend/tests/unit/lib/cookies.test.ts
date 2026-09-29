/**
 * cookies.test.ts
 * Unit tests for backend/src/lib/cookies.ts: correct Set-Cookie attributes on set/clear (via a
 * tiny Express app + Supertest), and manual Cookie-header parsing on read.
 * Spec: docs/spec/09 §9.5 (Table 53 – refresh token cookie)
 */
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from '../../../src/lib/cookies.js';

function buildApp() {
  const app = express();
  app.get('/set', (_req, res) => {
    setRefreshCookie(res, 'the-token-value', 7 * 24 * 60 * 60 * 1000);
    res.status(204).end();
  });
  app.get('/clear', (_req, res) => {
    clearRefreshCookie(res);
    res.status(204).end();
  });
  app.get('/read', (req, res) => {
    res.json({ token: readRefreshCookie(req) ?? null });
  });
  return app;
}

describe('setRefreshCookie', () => {
  it('sets HttpOnly, Secure, SameSite=Strict, correct path and Max-Age', async () => {
    const res = await request(buildApp()).get('/set');
    const cookie = res.headers['set-cookie']?.[0] as string;
    expect(cookie).toContain('cc_rt=the-token-value');
    expect(cookie).toContain('Path=/api/v1/auth');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toMatch(/Max-Age=604800/);
  });
});

describe('clearRefreshCookie', () => {
  it('sets Max-Age=0 with the same attributes as setRefreshCookie', async () => {
    const res = await request(buildApp()).get('/clear');
    const cookie = res.headers['set-cookie']?.[0] as string;
    expect(cookie).toContain('cc_rt=;');
    expect(cookie).toContain('Max-Age=0');
    expect(cookie).toContain('Path=/api/v1/auth');
  });
});

describe('readRefreshCookie', () => {
  it('reads the cookie value from a raw Cookie header', async () => {
    const res = await request(buildApp()).get('/read').set('Cookie', 'cc_rt=abc123; other=xyz');
    expect(res.body).toEqual({ token: 'abc123' });
  });

  it('returns undefined/null when the cookie is absent', async () => {
    const res = await request(buildApp()).get('/read');
    expect(res.body).toEqual({ token: null });
  });
});
