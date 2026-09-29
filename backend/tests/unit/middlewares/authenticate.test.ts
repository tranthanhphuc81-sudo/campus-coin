/**
 * authenticate.test.ts
 * Unit tests for backend/src/middlewares/authenticate.ts against the fixed test-mode key pair
 * from config/env.ts (NODE_ENV=test): valid token → req.auth populated; missing/invalid/expired/
 * wrong-issuer/revoked-session token → 401 (token-expired for the expiry case). Session
 * revocation is mocked (`isSessionActive`) so this stays a pure unit test with no real Redis.
 * Spec: docs/spec/09 §9.5 (Table 53 – access token)
 */
import { JWT_AUDIENCE, JWT_ISSUER, Role } from '@campuscoin/shared';
import { importPKCS8, SignJWT } from 'jose';
import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { config } from '../../../src/config/env.js';

const isSessionActiveMock = vi.fn().mockResolvedValue(true);
vi.mock('../../../src/modules/sessions/session.service.js', () => ({
  isSessionActive: isSessionActiveMock,
}));

const { authenticate } = await import('../../../src/middlewares/authenticate.js');

async function signToken(overrides: Partial<{ sub: string; role: string; sid: string; issuer: string; audience: string; expiresIn: string }> = {}) {
  const key = await importPKCS8(config.auth.jwtPrivateKey, 'EdDSA');
  return new SignJWT({ role: overrides.role ?? Role.STUDENT, sid: overrides.sid ?? 'session-1' })
    .setProtectedHeader({ alg: 'EdDSA' })
    .setSubject(overrides.sub ?? 'user-1')
    .setIssuer(overrides.issuer ?? JWT_ISSUER)
    .setAudience(overrides.audience ?? JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(overrides.expiresIn ?? '15m')
    .sign(key);
}

function buildReq(authorization?: string): Request {
  return { header: (name: string) => (name.toLowerCase() === 'authorization' ? authorization : undefined) } as unknown as Request;
}

describe('authenticate', () => {
  it('sets req.auth from a valid token', async () => {
    const token = await signToken();
    const req = buildReq(`Bearer ${token}`);
    const next = vi.fn() as NextFunction;

    await authenticate(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.auth).toEqual({ userId: 'user-1', role: Role.STUDENT, sessionId: 'session-1' });
  });

  it('rejects a missing Authorization header', async () => {
    const next = vi.fn() as NextFunction;

    await authenticate(buildReq(undefined), {} as Response, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401, type: 'unauthenticated' }));
  });

  it('rejects a token signed with the wrong key', async () => {
    const otherKey = await importPKCS8(
      // A different, throwaway Ed25519 key — never the app's own.
      '-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEICeg16/naUNBGNMiPmaMfl0aSw24PAQvUqm40Y0qVG+N\n-----END PRIVATE KEY-----\n',
      'EdDSA',
    );
    const token = await new SignJWT({ role: Role.STUDENT, sid: 's1' })
      .setProtectedHeader({ alg: 'EdDSA' })
      .setSubject('user-1')
      .setIssuer(JWT_ISSUER)
      .setAudience(JWT_AUDIENCE)
      .setExpirationTime('15m')
      .sign(otherKey);
    const next = vi.fn() as NextFunction;

    await authenticate(buildReq(`Bearer ${token}`), {} as Response, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401, type: 'unauthenticated' }));
  });

  it('rejects an expired token with type token-expired', async () => {
    const token = await signToken({ expiresIn: '-1s' });
    const next = vi.fn() as NextFunction;

    await authenticate(buildReq(`Bearer ${token}`), {} as Response, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401, type: 'token-expired' }));
  });

  it('rejects a token with the wrong audience', async () => {
    const token = await signToken({ audience: 'someone-else' });
    const next = vi.fn() as NextFunction;

    await authenticate(buildReq(`Bearer ${token}`), {} as Response, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401, type: 'unauthenticated' }));
  });

  it('rejects a malformed payload (unknown role)', async () => {
    const token = await signToken({ role: 'superadmin' });
    const next = vi.fn() as NextFunction;

    await authenticate(buildReq(`Bearer ${token}`), {} as Response, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
  });

  it('rejects a token whose session was revoked', async () => {
    isSessionActiveMock.mockResolvedValueOnce(false);
    const token = await signToken();
    const next = vi.fn() as NextFunction;

    await authenticate(buildReq(`Bearer ${token}`), {} as Response, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401, type: 'unauthenticated' }));
    expect(isSessionActiveMock).toHaveBeenCalledWith('session-1');
  });
});
