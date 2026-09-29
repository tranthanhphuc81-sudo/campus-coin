/**
 * cors.ts
 * CORS allowlist from CORS_ORIGINS. Credentials (cookies) are only ever needed by the refresh-
 * token flow, so two middlewares are exported: `corsDefault` (no credentials, mounted globally,
 * but skipping the credentialed prefixes below so their preflight is answered by
 * `corsWithCredentials` instead) and `corsWithCredentials` (mounted on the `/api/v1/auth` and
 * `/api/v1/admin/auth` prefixes in app.ts, ahead of their routers) — matching docs/spec/09 §9.11
 * Table 57 exactly. Requests with no `Origin` header (health checks, server-to-server, curl) are
 * always allowed through: CORS is a browser-enforced mechanism and does not apply to them.
 * Main exports: corsDefault, corsWithCredentials
 * Spec: docs/spec/09 §9.11 (Table 57) · docs/spec/04 §4.2 (middleware order)
 */
import cors from 'cors';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { API_BASE_PATH } from '@campuscoin/shared';
import { config } from '../config/env.js';

/** Path prefixes that need `Access-Control-Allow-Credentials: true` (the cookie-based flows). */
const CREDENTIALED_PREFIXES = [`${API_BASE_PATH}/auth`, `${API_BASE_PATH}/admin/auth`];

/** True when `path` is under one of the credentialed prefixes. */
function isCredentialedPath(path: string): boolean {
  return CREDENTIALED_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/**
 * Allows `origin` when unset (non-browser caller) or present in CORS_ORIGINS; otherwise denies it
 * via `callback(null, false)` — never `callback(new Error(...))`. Passing an `Error` here makes
 * the `cors` package call `next(err)`, which (a) 500s a routine "wrong origin" request instead of
 * just omitting the CORS headers, and (b) floods the logs on every scan/bad client (security
 * review 11).
 */
function originCheck(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void): void {
  callback(null, !origin || config.app.corsOrigins.includes(origin));
}

const corsDefaultMiddleware: RequestHandler = cors({ origin: originCheck, credentials: false });

/**
 * Applied globally: Bearer-token APIs never need cookies, so credentials are off. Skips the
 * credentialed prefixes entirely (`next()` with no CORS headers at all) so a preflight OPTIONS
 * request to one of them is answered by {@link corsWithCredentials} instead — otherwise, since
 * this middleware is mounted first, its own `Access-Control-Allow-Credentials`-less preflight
 * response would win and the browser would never see the cookie-flow's real CORS headers.
 */
export const corsDefault: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  if (isCredentialedPath(req.path)) {
    next();
    return;
  }
  corsDefaultMiddleware(req, res, next);
};

/** Applied only to `/api/v1/auth/*` and `/api/v1/admin/auth/*`: these set/read the HttpOnly cookie. */
export const corsWithCredentials: RequestHandler = cors({ origin: originCheck, credentials: true });
