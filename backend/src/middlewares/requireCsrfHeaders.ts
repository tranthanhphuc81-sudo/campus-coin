/**
 * requireCsrfHeaders.ts
 * Lightweight CSRF guard for cookie-authenticated endpoints (`/auth/refresh`, `/auth/logout`,
 * `/auth/logout-all`). A cross-site form/simple request cannot set a custom header or a
 * same-origin `Origin`, so requiring both closes CSRF without a token/double-submit scheme.
 * Main exports: requireCsrfHeaders
 * Spec: docs/spec/09 §9.11 (Table 57 – CSRF) · docs/spec/07 §7.3.1
 */
import type { RequestHandler } from 'express';
import { config } from '../config/env.js';
import { forbidden } from '../lib/problem.js';

/**
 * Express middleware: requires an `Origin` header present in `CORS_ORIGINS` and a non-empty
 * `X-Requested-With` header; otherwise responds 403 forbidden. Mounted only on refresh/logout.
 */
export const requireCsrfHeaders: RequestHandler = (req, _res, next) => {
  const origin = req.header('origin');
  const requestedWith = req.header('x-requested-with');
  if (!origin || !config.app.corsOrigins.includes(origin) || !requestedWith) {
    next(forbidden('Missing or invalid CSRF headers.'));
    return;
  }
  next();
};
