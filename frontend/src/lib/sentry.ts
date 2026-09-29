/**
 * sentry.ts
 * Error monitoring (P20, docs/spec/10 §11.3 VITE_SENTRY_DSN). Does nothing when the env var is
 * unset (local/CI default). `@sentry/react` is dynamically imported so it never lands in the
 * initial bundle (docs/spec/10 §10.1 Bảng 60: initial bundle < 200 KB gzip) — it loads as its own
 * chunk, fetched in parallel with the first render instead of blocking it.
 * Main exports: initSentry
 * Spec: docs/spec/10 §10.1 · §11.3 · docs/spec/09 §9.16 (no PII to a third party)
 */

const SENSITIVE_KEY = /password|token|secret|authorization|cookie|mfa|email|recoverycode/i;
// A URL's own path is fine to report; its query string can carry a live secret this app puts
// there on purpose (`/verify-email?token=…`, `/reset-password?token=…`, the SSE `?ticket=`) —
// stripped here rather than added to SENSITIVE_KEY, since the *key* holding a URL is never named
// "token" itself (security review finding, P20 — the equivalent backend gap was in Sentry's own
// default cookie/body collection, not this app's own scrub, but the same "don't ship live secrets
// in a URL" principle applies to breadcrumb/event URLs here too).
function stripQuery(url: string): string {
  const i = url.indexOf('?');
  return i === -1 ? url : url.slice(0, i);
}

/** Recursively strips values under keys that could carry a secret or personal data. */
function scrub<T>(value: T, depth = 0): T {
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1)) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY.test(key)) {
      out[key] = '[redacted]';
    } else if (/^url$/i.test(key) && typeof val === 'string') {
      out[key] = stripQuery(val);
    } else {
      out[key] = scrub(val, depth + 1);
    }
  }
  return out as T;
}

/**
 * Loads and initializes the Sentry browser SDK. Call once, right after the app mounts. A no-op
 * (and never fetches the Sentry chunk) when `VITE_SENTRY_DSN` is not configured.
 */
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  void import('@sentry/react').then((Sentry) => {
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE,
      // No session replay / performance tracing — this app only wants error reporting, and both
      // would cost bundle size and PII exposure this project doesn't need.
      integrations: [],
      tracesSampleRate: 0,
      beforeSend(event) {
        return scrub(event);
      },
      beforeBreadcrumb(breadcrumb) {
        return scrub(breadcrumb);
      },
    });
  });
}
