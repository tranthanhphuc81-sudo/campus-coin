/**
 * sentry.ts
 * Error monitoring (P20, docs/spec/10 §10.5 monitoring · §11.3 SENTRY_DSN/SENTRY_ENV). A no-op
 * everywhere when `SENTRY_DSN` is empty (local/CI/test default) — `captureError` and `closeSentry`
 * are always safe to call unconditionally from server.ts/worker.ts/errorHandler.ts.
 *
 * `@sentry/node` is dynamically imported, only when a DSN is actually configured — found via a
 * real test-suite regression (P20): a plain top-level `import * as Sentry from '@sentry/node'`
 * has side effects at module-load time (it wires up OpenTelemetry's require-hook instrumentation
 * for Node built-ins/DB drivers) regardless of whether `Sentry.init()` ever runs, which was enough
 * to push ~16 DB-touching integration tests past their timeout even with no DSN configured. Since
 * `errorHandler.ts` (and therefore this module) loads on every request, that cost was global.
 * Mirrors the same lazy pattern already used on the frontend (frontend/src/lib/sentry.ts).
 * Main exports: initSentry, captureError, closeSentry
 * Spec: docs/spec/10 §10.5 · §11.3 · docs/spec/09 §9.12 (never log/report secrets)
 */
import type * as Sentry from '@sentry/node';
import { config } from '../config/env.js';

let sentry: typeof Sentry | undefined;
let initPromise: Promise<void> | undefined;

// Mirrors lib/logger.ts's REDACT_PATHS field names (case-insensitive, matched by bare key name
// regardless of nesting depth) — an event/breadcrumb sent to a third-party SaaS must never carry
// a password, token, secret or PII field even if it slipped past the log redactor. This is
// defense-in-depth ONLY: `dataCollection` below (a security review finding, P20) is the primary
// control, since this SDK version's default is to collect the full raw request body/cookies —
// a plain object-key scrub like this one can never see into that raw body string.
const SENSITIVE_KEYS = new Set([
  'password',
  'newpassword',
  'currentpassword',
  'passwordhash',
  'mfasecretenc',
  'tokenhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'cookie',
  'set-cookie',
  'cc_rt',
  'mfacode',
  'mfatoken',
  'recoverycode',
  'recoverycodes',
  'secret',
  'apikey',
  'x-goog-api-key',
  'email',
  'ip',
  'ip_address',
  'x-forwarded-for',
  'x-real-ip',
]);

/** Recursively replaces every value whose key matches {@link SENSITIVE_KEYS} with `'[redacted]'`. */
function scrub<T>(value: T, depth = 0): T {
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1)) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? '[redacted]' : scrub(val, depth + 1);
  }
  return out as T;
}

/**
 * Loads and initializes the Sentry Node SDK. Call once at process start (server.ts, worker.ts).
 * Does nothing — and never imports `@sentry/node` at all — when `SENTRY_DSN` is unset.
 */
export function initSentry(): void {
  if (initPromise || !config.monitoring.sentryDsn) return;
  initPromise = import('@sentry/node').then((Sentry) => {
    sentry = Sentry;
    Sentry.init({
      dsn: config.monitoring.sentryDsn,
      environment: config.monitoring.sentryEnv,
      // This app has no APM/perf budget for Sentry; only error reporting is wanted.
      tracesSampleRate: 0,
      // Security review finding (P20): this SDK's own defaults collect the full request body,
      // cookies (incl. the `cc_rt` refresh-token cookie) and headers (incl. `Authorization`) —
      // exactly the data a 5xx on /auth/login, /auth/refresh or /me/password must never leak to a
      // third party. Every category is off; `beforeSend`'s `scrub()` above is defense-in-depth only.
      dataCollection: {
        httpBodies: [],
        cookies: false,
        httpHeaders: false,
        urlQueryParams: false,
        userInfo: false,
      },
      beforeSend(event) {
        return scrub(event);
      },
      beforeBreadcrumb(breadcrumb) {
        return scrub(breadcrumb);
      },
    });
  });
}

/**
 * Reports an unexpected (5xx-class) error to Sentry, tagged with the request id for correlation
 * with pino logs. A no-op when Sentry was never initialized (or hasn't finished loading yet —
 * best-effort only, never worth blocking the response on).
 * @param err - The original thrown/rejected error.
 * @param context - Extra, already-safe-to-share tags (never raw request bodies).
 */
export function captureError(err: unknown, context: { requestId?: string; route?: string } = {}): void {
  sentry?.captureException(err, { tags: context });
}

/** Flushes any pending events before process exit; a no-op when Sentry was never initialized. */
export async function closeSentry(): Promise<void> {
  if (!initPromise) return;
  await initPromise;
  await sentry?.close(2000);
}
