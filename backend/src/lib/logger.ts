/**
 * logger.ts
 * Process-wide pino logger and the pino-http request-logging middleware. JSON output with a
 * `requestId` field (see middlewares/requestId.ts); pretty-printed only in development.
 * Redacts password, token, authorization, cookie, mfaCode, passwordHash, mfaSecretEnc wherever
 * they appear in the log object, up to 2 levels of nesting (C-L1: pino redact paths are exact-depth,
 * so `req.body.token` needs its own `*.*.token` wildcard entry — a single `*.token` only catches a
 * 1-level-deep occurrence). `code`/`*.code` is intentionally NOT blanket-redacted (narrowed to
 * `body.code`/`*.body.code`, the MFA-code request field) so `err.code` (e.g. `ECONNREFUSED`)
 * survives for debugging.
 * Main exports: logger, httpLogger, REDACT_PATHS
 * Spec: docs/spec/03 §3.2 (backend stack) · docs/spec/09 §9.12 (audit & monitoring) ·
 *   docs/security/review-p19.md C-L1
 */
import { randomUUID } from 'node:crypto';
import { pinoHttp } from 'pino-http';
import pino from 'pino';
import { config } from '../config/env.js';

// Every path a secret could appear under in a request/response log object. Each field gets 3
// depths (bare, `*.field`, `*.*.field`) so a 1-, 2- or 3-segment-deep occurrence (e.g. `token`,
// `body.token`, `req.body.token`) is always covered — pino's redact match is exact-depth, it does
// NOT recurse through a single wildcard the way a glob `**` would (C-L1).
const REDACT_PATHS = [
  'password',
  '*.password',
  '*.*.password',
  'newPassword',
  '*.newPassword',
  '*.*.newPassword',
  'currentPassword',
  '*.currentPassword',
  '*.*.currentPassword',
  // Argon2id hash + encrypted TOTP secret: never useful in a log, always sensitive (C-L1).
  'passwordHash',
  '*.passwordHash',
  '*.*.passwordHash',
  'mfaSecretEnc',
  '*.mfaSecretEnc',
  '*.*.mfaSecretEnc',
  // SHA-256 hash of a refresh/reset/verify token — still lets an attacker probe for a specific
  // known token's presence in a leaked log, so it's redacted alongside the raw token (C-L1).
  'tokenHash',
  '*.tokenHash',
  '*.*.tokenHash',
  'token',
  '*.token',
  '*.*.token',
  'authorization',
  '*.authorization',
  '*.*.authorization',
  'cookie',
  '*.cookie',
  '*.*.cookie',
  'mfaCode',
  '*.mfaCode',
  '*.*.mfaCode',
  'recoveryCode',
  '*.recoveryCode',
  '*.*.recoveryCode',
  'recoveryCodes',
  '*.recoveryCodes',
  '*.*.recoveryCodes',
  // C-L1: narrowed from a blanket `code`/`*.code`/`*.*.code` (which also hid `err.code`, e.g.
  // `ECONNREFUSED`, destroying useful diagnostics) to just the MFA-code request-body field.
  'body.code',
  '*.body.code',
  'mfaToken',
  '*.mfaToken',
  '*.*.mfaToken',
  'secret',
  '*.secret',
  '*.*.secret',
  'accessToken',
  '*.accessToken',
  '*.*.accessToken',
  'refreshToken',
  '*.refreshToken',
  '*.*.refreshToken',
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
  // AI provider API key (P10): never let it leak into a provider-error log line.
  'apiKey',
  '*.apiKey',
  '*.*.apiKey',
  'headers["x-goog-api-key"]',
  '*.headers["x-goog-api-key"]',
];

// Exported so tests can build a pino instance against the exact same redact config the process
// uses (C-L1) instead of re-typing a parallel copy that could silently drift out of sync.
export { REDACT_PATHS };

/** Process-wide pino logger. */
export const logger = pino({
  level: config.app.logLevel,
  redact: { paths: REDACT_PATHS, censor: '[redacted]' },
  transport: config.app.isDev ? { target: 'pino-pretty', options: { colorize: true } } : undefined,
});

/**
 * Express middleware that logs one line per request/response, correlated by `req.id`
 * (set by middlewares/requestId.ts) and attaches a child logger at `req.log`.
 */
export const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => (req as { id?: string }).id ?? randomUUID(),
  redact: { paths: REDACT_PATHS, censor: '[redacted]' },
});
