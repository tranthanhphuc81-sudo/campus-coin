/**
 * auth.controller.ts
 * HTTP <-> DTO glue for `/api/v1/auth/*`. Reads parsed input from `req.validated` (never raw
 * `req.body`), extracts request context (IP/User-Agent) for the service layer, and maps service
 * results onto the exact response shapes from docs/spec/07 §7.3.1. All business logic lives in
 * `auth.service.ts` — this file has none.
 * Main exports: register, verifyEmail, resendVerification, forgotPassword, resetPassword, login,
 *   refresh, logout, logoutAll
 * Spec: docs/spec/07 §7.3.1 · docs/spec/09 §9.5
 */
import type {
  EmailOnlyInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  VerifyEmailInput,
} from '@campuscoin/shared';
import type { Request, RequestHandler } from 'express';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from '../../lib/cookies.js';
import { unauthenticated } from '../../lib/problem.js';
import { toUserDto } from '../users/users.mapper.js';
import * as authService from './auth.service.js';

/** Builds the `SessionContext` (IP/User-Agent) shared by every auth service call. */
function contextFrom(req: Request): { ip?: string; userAgent?: string } {
  return { ip: req.ip, userAgent: req.header('user-agent') };
}

/** `POST /auth/register` — always 202 with an identical body regardless of outcome (BR-AU-03). */
export const register: RequestHandler = async (req, res) => {
  const body = req.validated?.body as RegisterInput;
  await authService.register(body, contextFrom(req));
  res.status(202).json({ message: authService.REGISTER_ACK_MESSAGE });
};

/** `POST /auth/verify-email` — activates the account behind a valid, unused, unexpired token. */
export const verifyEmail: RequestHandler = async (req, res) => {
  const body = req.validated?.body as VerifyEmailInput;
  await authService.verifyEmail(body.token);
  res.status(200).json({ message: 'Your email has been verified. You can now sign in.' });
};

/** `POST /auth/resend-verification` — always 202, same message, regardless of account state. */
export const resendVerification: RequestHandler = async (req, res) => {
  const body = req.validated?.body as EmailOnlyInput;
  await authService.resendVerification(body.email);
  res.status(202).json({ message: authService.REGISTER_ACK_MESSAGE });
};

/** `POST /auth/forgot-password` — always 202 with the same fixed message (BR-AU-03). */
export const forgotPassword: RequestHandler = async (req, res) => {
  const body = req.validated?.body as EmailOnlyInput;
  await authService.forgotPassword(body.email, contextFrom(req));
  res.status(202).json({ message: authService.FORGOT_PASSWORD_ACK_MESSAGE });
};

/** `POST /auth/reset-password` — consumes the token and sets a new password. */
export const resetPassword: RequestHandler = async (req, res) => {
  const body = req.validated?.body as ResetPasswordInput;
  await authService.resetPassword(body.token, body.newPassword, contextFrom(req));
  res.status(200).json({ message: 'Your password has been reset. You can now sign in.' });
};

/** `POST /auth/login` — sets the refresh cookie and returns the access token + user DTO. */
export const login: RequestHandler = async (req, res) => {
  const body = req.validated?.body as LoginInput;
  const result = await authService.login(body, contextFrom(req));
  setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt.getTime() - Date.now());
  res.status(200).json({
    accessToken: result.accessToken,
    tokenType: 'Bearer',
    expiresIn: result.expiresIn,
    user: toUserDto(result.user),
  });
};

/**
 * `POST /auth/refresh` — rotates the refresh-token cookie (mounted behind `requireCsrfHeaders`).
 * On any failure the (now-invalid) cookie is cleared so the browser stops resending it.
 */
export const refresh: RequestHandler = async (req, res, next) => {
  const raw = readRefreshCookie(req);
  if (!raw) {
    clearRefreshCookie(res);
    next(unauthenticated('Missing refresh token cookie'));
    return;
  }
  try {
    const result = await authService.refresh(raw, contextFrom(req));
    setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt.getTime() - Date.now());
    res.status(200).json({
      accessToken: result.accessToken,
      tokenType: 'Bearer',
      expiresIn: result.expiresIn,
      user: toUserDto(result.user),
    });
  } catch (err) {
    clearRefreshCookie(res);
    next(err);
  }
};

/**
 * `POST /auth/logout` — best-effort revoke of the session behind the cookie (mounted behind
 * `requireCsrfHeaders`); always clears the cookie and returns 204, even with no cookie at all.
 * The cookie is cleared in `finally` (security review 10) so it is never left behind on the
 * client even if the revoke itself throws unexpectedly.
 */
export const logout: RequestHandler = async (req, res) => {
  const raw = readRefreshCookie(req);
  try {
    await authService.logout(raw, contextFrom(req));
  } finally {
    clearRefreshCookie(res);
  }
  res.status(204).end();
};

/**
 * `POST /auth/logout-all` — authenticated "sign out everywhere" (mounted behind `authenticate` +
 * `requireCsrfHeaders`); revokes every session of the caller and clears the current cookie too.
 */
export const logoutAll: RequestHandler = async (req, res) => {
  await authService.logoutAll(req.auth!.userId, contextFrom(req));
  clearRefreshCookie(res);
  res.status(204).end();
};
