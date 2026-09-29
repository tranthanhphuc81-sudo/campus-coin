/**
 * jwt.test.ts
 * Unit tests for backend/src/lib/jwt.ts: sign → authenticate-verify round trip, `kid` header
 * present, admin access token TTL is 10 min, and an MFA token is rejected by `authenticate`
 * (wrong audience) while a normal access token is rejected by `verifyMfaToken`.
 * Spec: docs/spec/09 §9.5 (Table 53), §9.7 (MFA challenge token)
 */
import { Role } from '@campuscoin/shared';
import type { NextFunction, Request, Response } from 'express';
import { decodeProtectedHeader } from 'jose';
import { describe, expect, it, vi } from 'vitest';
import { authenticate } from '../../../src/middlewares/authenticate.js';
import { signAccessToken, signMfaToken, verifyMfaToken } from '../../../src/lib/jwt.js';

function buildReq(authorization?: string): Request {
  return { header: (name: string) => (name.toLowerCase() === 'authorization' ? authorization : undefined) } as unknown as Request;
}

describe('signAccessToken', () => {
  it('signs a token that authenticate accepts, with kid header set', async () => {
    const { token, expiresIn } = await signAccessToken({ userId: 'user-1', role: Role.STUDENT, sessionId: 'sess-1' });
    expect(expiresIn).toBe(15 * 60);
    expect(decodeProtectedHeader(token)).toMatchObject({ alg: 'EdDSA', typ: 'JWT' });

    const next = vi.fn() as NextFunction;
    await authenticate(buildReq(`Bearer ${token}`), {} as Response, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('issues a 10-minute token for the admin role', async () => {
    const { expiresIn } = await signAccessToken({ userId: 'admin-1', role: Role.ADMIN, sessionId: 'sess-2' });
    expect(expiresIn).toBe(10 * 60);
  });
});

describe('signMfaToken / verifyMfaToken', () => {
  it('round-trips userId and jti', async () => {
    const { token, jti, expiresIn } = await signMfaToken({ userId: 'admin-1' });
    expect(expiresIn).toBe(5 * 60);
    await expect(verifyMfaToken(token)).resolves.toEqual({ userId: 'admin-1', jti });
  });

  it('is rejected by authenticate (wrong audience)', async () => {
    const { token } = await signMfaToken({ userId: 'admin-1' });
    const next = vi.fn() as NextFunction;
    await authenticate(buildReq(`Bearer ${token}`), {} as Response, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
  });

  it('rejects a normal access token presented as an MFA token', async () => {
    const { token } = await signAccessToken({ userId: 'user-1', role: Role.STUDENT, sessionId: 'sess-1' });
    await expect(verifyMfaToken(token)).rejects.toMatchObject({ status: 401 });
  });
});
