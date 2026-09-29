/**
 * authenticate.ts
 * Verifies the `Authorization: Bearer <accessToken>` JWT: fixed algorithm (EdDSA), checks
 * issuer/audience/expiry, and populates `req.auth` from the `sub`/`role`/`sid` claims. The
 * audience check (`JWT_AUDIENCE`, the normal API audience) also rejects an MFA challenge token
 * (audience `JWT_MFA_AUDIENCE`, see `lib/jwt.ts`) presented here by mistake. After the JWT itself
 * verifies, `isSessionActive(sid)` is checked (cheap Redis GET on the happy path) so a
 * logged-out/revoked session dies immediately even though the JWT hasn't expired yet.
 * Main exports: authenticate
 * Spec: docs/spec/09 §9.5 (Table 53 – access token)
 */
import { errors, jwtVerify } from 'jose';
import { JWT_AUDIENCE, JWT_ISSUER, Role, type Role as RoleType } from '@campuscoin/shared';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ALGORITHM, getPublicKey } from '../lib/jwt.js';
import { unauthenticated } from '../lib/problem.js';
import { isSessionActive } from '../modules/sessions/session.service.js';

const BEARER_PREFIX = 'Bearer ';

function isRole(value: unknown): value is RoleType {
  return value === Role.STUDENT || value === Role.ADMIN;
}

/**
 * Express middleware: 401s (`unauthenticated`/`token-expired`) on a missing/invalid/expired
 * token, otherwise sets `req.auth = { userId, role, sessionId }` and calls `next()`.
 * Express 5 handles an async middleware's rejections, but every failure here is caught and
 * turned into a specific `AppError` instead, so error handling stays local to this file.
 */
export const authenticate: RequestHandler = async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.header('authorization');
  const token = header?.startsWith(BEARER_PREFIX) ? header.slice(BEARER_PREFIX.length).trim() : undefined;
  if (!token) {
    next(unauthenticated('Missing or malformed Authorization header'));
    return;
  }

  try {
    const key = await getPublicKey();
    const { payload } = await jwtVerify(token, key, {
      algorithms: [ALGORITHM],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    const { sub: userId, sid: sessionId, role } = payload as { sub?: string; sid?: unknown; role?: unknown };
    if (typeof userId !== 'string' || typeof sessionId !== 'string' || !isRole(role)) {
      next(unauthenticated('Access token payload is malformed'));
      return;
    }
    if (!(await isSessionActive(sessionId))) {
      next(unauthenticated('Session has been revoked'));
      return;
    }
    req.auth = { userId, role, sessionId };
    next();
  } catch (err) {
    if (err instanceof errors.JWTExpired) {
      next(unauthenticated('Access token has expired', 'token-expired'));
      return;
    }
    next(unauthenticated('Invalid access token'));
  }
};
