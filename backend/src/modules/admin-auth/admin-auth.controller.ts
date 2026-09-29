/**
 * admin-auth.controller.ts
 * HTTP <-> DTO glue for `/api/v1/admin/auth/*`. Reads parsed input from `req.validated` (never
 * raw `req.body`), extracts request context (IP/User-Agent) for the service layer, and maps
 * service results onto the response shapes from docs/spec/07 §7.3.1 / §7.4. No business logic
 * lives here — see `admin-auth.service.ts`.
 * Main exports: login, mfaVerify
 * Spec: docs/spec/07 §7.3.1 · docs/spec/09 §9.5 (MFA row)
 */
import type { AdminLoginInput, MfaVerifyInput } from '@campuscoin/shared';
import type { Request, RequestHandler } from 'express';
import { setRefreshCookie } from '../../lib/cookies.js';
import { toUserDto } from '../users/users.mapper.js';
import * as adminAuthService from './admin-auth.service.js';

/** Builds the `SessionContext` (IP/User-Agent) shared by every admin-auth service call. */
function contextFrom(req: Request): { ip?: string; userAgent?: string } {
  return { ip: req.ip, userAgent: req.header('user-agent') };
}

/**
 * `POST /admin/auth/login` — verifies email/password and always responds with an MFA challenge on
 * success (never a session directly). A-M4: no `enrolment` payload any more — MFA enrolment now
 * happens exclusively via `npm run admin:create -w backend`, before the account can ever log in.
 */
export const login: RequestHandler = async (req, res) => {
  const body = req.validated?.body as AdminLoginInput;
  const result = await adminAuthService.adminLogin(body, contextFrom(req));
  res.status(200).json({
    mfaRequired: result.mfaRequired,
    mfaToken: result.mfaToken,
    expiresIn: result.expiresIn,
  });
};

/**
 * `POST /admin/auth/mfa/verify` — consumes the `mfaToken` + TOTP/recovery code, sets the refresh
 * cookie and returns the access token + user DTO.
 */
export const mfaVerify: RequestHandler = async (req, res) => {
  const body = req.validated?.body as MfaVerifyInput;
  const result = await adminAuthService.adminMfaVerify(body, contextFrom(req));
  setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt.getTime() - Date.now());
  res.status(200).json({
    accessToken: result.accessToken,
    tokenType: 'Bearer',
    expiresIn: result.expiresIn,
    user: toUserDto(result.user),
  });
};
