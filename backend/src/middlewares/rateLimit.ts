/**
 * rateLimit.ts
 * Rate-limiting factory backed by Redis (shared across API instances) plus the presets from
 * docs/spec/07 §7.4 (Table 46). Each preset is an array of one or two middlewares (some rows in
 * Table 46 combine a short and a long window, e.g. login = 5/min AND 20/hour) — mount the whole
 * array on the route once it exists (P04+). If Redis is unreachable, requests are allowed through
 * (fail open) rather than 500ing the whole API: availability over strict limiting during an
 * outage (docs/spec/10 §10.5 graceful degradation).
 * Main exports: createRateLimiter, RATE_LIMIT_PRESETS, refreshCookieKey
 * Spec: docs/spec/07 §7.4 (Table 46) · docs/spec/09 §9.4 (STRIDE – Denial of Service)
 */
import type { Request } from 'express';
import { DATA_EXPORT_MAX_PER_DAY, emailSchema } from '@campuscoin/shared';
import {
  ipKeyGenerator,
  rateLimit as expressRateLimit,
  type AugmentedRequest,
  type RateLimitRequestHandler,
} from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { readRefreshCookie } from '../lib/cookies.js';
import { decodeMfaTokenSubUnsafe } from '../lib/jwt.js';
import { rateLimited } from '../lib/problem.js';
import { redis } from '../lib/redis.js';
import { sha256Hex } from '../lib/tokens.js';

const ONE_MINUTE_MS = 60_000;
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;
const THIRTY_DAYS_MS = 30 * ONE_DAY_MS;

/**
 * IPv6 subnet size (in bits) collapsed into one rate-limit bucket (A-M1): a residential/mobile
 * IPv6 allocation is typically a /56 or /64, so without this an attacker who owns a /56 (or wider)
 * can rotate addresses to get a fresh bucket on every single request, defeating IP-keyed limiting
 * entirely. IPv4 addresses are never affected (still one address = one bucket).
 */
const IPV6_RATE_LIMIT_SUBNET_BITS = 56;

/**
 * Collapses `req.ip` into its {@link IPV6_RATE_LIMIT_SUBNET_BITS}-bit IPv6 subnet (IPv4 addresses
 * pass through unchanged) via express-rate-limit's own helper — every IP-based key in this file
 * must go through this, never raw `req.ip` (A-M1, closes `ERR_ERL_KEY_GEN_IPV6`).
 */
function ipKey(req: Request): string {
  return ipKeyGenerator(req.ip ?? '', IPV6_RATE_LIMIT_SUBNET_BITS);
}

export interface RateLimiterOptions {
  /** Window size in ms. */
  windowMs: number;
  /** Max requests per key per window. */
  max: number;
  /** Namespaces this limiter's Redis keys so different presets never collide. */
  keyPrefix: string;
  /** Counts requests by this key (default: caller IP, subnet-collapsed for IPv6 — see {@link ipKey}). */
  keyGenerator?: (req: Request) => string;
  /**
   * Whether a broken Redis lets the request through unlimited (`true`, default) instead of
   * failing the request (`false`). A-L5: auth-related presets set this `false` — during a Redis
   * outage, briefly blocking legitimate auth traffic is safer than disabling brute-force/abuse
   * limiting on login/register/reset/MFA entirely. Left `true` (fail-open) elsewhere, where
   * blocking otherwise-legitimate authenticated traffic would be the worse outcome.
   */
  passOnStoreError?: boolean;
}

/**
 * Builds a Redis-backed rate limiter that responds with RFC 9457 `rate-limited` (429) and a
 * `Retry-After` header (set by errorHandler from `AppError.retryAfter`) once the limit is hit.
 */
export function createRateLimiter(options: RateLimiterOptions): RateLimitRequestHandler {
  return expressRateLimit({
    windowMs: options.windowMs,
    max: options.max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: options.keyGenerator ?? ipKey,
    store: new RedisStore({
      prefix: `rl:${options.keyPrefix}:`,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ioredis' overloaded call() signature does not line up with RedisStore's generic sendCommand type.
      sendCommand: (...args: string[]) => redis.call(...(args as [string, ...string[]])) as any,
    }),
    passOnStoreError: options.passOnStoreError ?? true,
    handler: (req, _res, next) => {
      // express-rate-limit sets req[requestPropertyName] ('rateLimit' by default) at runtime,
      // but its own `handler` type only declares a plain `Request` — cast to read it back.
      const resetTime = (req as unknown as AugmentedRequest).rateLimit?.resetTime;
      const retryAfterSeconds = resetTime
        ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
        : Math.ceil(options.windowMs / 1000);
      next(rateLimited(retryAfterSeconds, 'Too many requests, please try again later.'));
    },
  });
}

/**
 * `req.body.email` (login/forgot-password bodies) or `'unknown'` before validation has run.
 * Normalised exactly like {@link emailSchema} (trim + lower-case) so `Foo@Bar.com`,
 * ` foo@bar.com ` and `foo@bar.com` all land in the same bucket — a client can no longer bypass
 * the limiter by padding/casing the email differently on each request (security review 3).
 */
function emailKey(req: Request): string {
  const email = (req.body as { email?: unknown } | undefined)?.email;
  if (typeof email !== 'string') return 'unknown';
  const parsed = emailSchema.safeParse(email);
  return parsed.success ? parsed.data : 'unknown';
}

/** IP + email composite key (Table 46: "IP + email"). IP is subnet-collapsed, see {@link ipKey}. */
function ipAndEmailKey(req: Request): string {
  return `${ipKey(req)}:${emailKey(req)}`;
}

/**
 * IP + the challenge token's own `sub` claim (security review 1c) — never a hash of the raw
 * token. Keying on `sub` (read unverified, purely to pick a bucket — never for authorization)
 * means every *fresh* `mfaToken` minted for the same admin shares one bucket, closing the brute-
 * force loop a per-token hash key would otherwise leave open (a new login mints a new token, and
 * therefore a new hash-of-token bucket, every time). Falls back to a token hash when the token
 * isn't even well-formed enough to read a `sub` from.
 */
function ipAndMfaTokenKey(req: Request): string {
  const mfaToken = (req.body as { mfaToken?: unknown } | undefined)?.mfaToken;
  let key = 'unknown';
  if (typeof mfaToken === 'string') {
    key = decodeMfaTokenSubUnsafe(mfaToken) ?? sha256Hex(mfaToken);
  }
  return `${ipKey(req)}:${key}`;
}

/**
 * The presented refresh-token cookie, hashed (never the raw token — it must not live in Redis
 * key names any more than necessary), or `no-cookie:<ip>` when none is present/well-formed
 * (P19 confirmation-review fix: keying `/refresh` and `/logout` by IP alone put every session
 * behind the same NAT/campus egress IP — CampusCoin's actual userbase — in one shared bucket,
 * so one student's own refresh-retry loop, or a burst of legitimate concurrent logins, could log
 * everyone else behind that IP out. A cookie is unique per session, so this naturally gives every
 * real session its own bucket; only genuinely cookie-less/malformed requests still share a
 * per-IP-collapsed fallback bucket).
 */
export function refreshCookieKey(req: Request): string {
  const token = readRefreshCookie(req);
  return token ? sha256Hex(token) : `no-cookie:${ipKey(req)}`;
}

/** Authenticated caller's user id (Table 46: "userId"). Requires `authenticate` to run first. */
function userIdKey(req: Request): string {
  return req.auth?.userId ?? ipKey(req);
}

/** Authenticated caller's user id + current month (Table 46: "userId + tháng"). */
function userIdAndMonthKey(req: Request): string {
  const month = new Date().toISOString().slice(0, 7);
  return `${userIdKey(req)}:${month}`;
}

/**
 * Ready-to-mount limiter presets from docs/spec/07 Table 46. Each value is applied as
 * `app.use(path, ...preset, handler)` on the route it protects (added in later phases).
 */
export const RATE_LIMIT_PRESETS = {
  /**
   * /auth/login — 5/min AND 20/hour keyed by IP + email, PLUS (A-M2) a 30/min AND 200/hour cap
   * keyed by IP alone: the IP+email limiter alone lets one IP spray a handful of passwords across
   * unlimited different emails without ever tripping a single account's lockout. `passOnStoreError:
   * false` (A-L5) on every leg — a Redis outage must not silently disable login rate limiting.
   */
  authLogin: [
    createRateLimiter({ windowMs: ONE_MINUTE_MS, max: 5, keyPrefix: 'auth-login-min', keyGenerator: ipAndEmailKey, passOnStoreError: false }),
    createRateLimiter({ windowMs: ONE_HOUR_MS, max: 20, keyPrefix: 'auth-login-hour', keyGenerator: ipAndEmailKey, passOnStoreError: false }),
    // IP-only backstop against spraying MANY accounts from one IP (A-M2) — deliberately much
    // looser than the IP+email leg above: a shared campus NAT/eduroam egress IP can legitimately
    // carry hundreds of concurrent students' own logins (P19 confirmation-review fix; the initial
    // 30/min, 200/h values falsely blocked ordinary shared-IP traffic long before catching a real
    // spray, which needs many DISTINCT emails per minute from one IP to look anything like this).
    createRateLimiter({ windowMs: ONE_MINUTE_MS, max: 100, keyPrefix: 'auth-login-ip-min', keyGenerator: ipKey, passOnStoreError: false }),
    createRateLimiter({ windowMs: ONE_HOUR_MS, max: 1000, keyPrefix: 'auth-login-ip-hour', keyGenerator: ipKey, passOnStoreError: false }),
  ],
  /**
   * /admin/auth/login — same shape as {@link RATE_LIMIT_PRESETS.authLogin} (IP+email AND a looser
   * IP-only backstop, A-M2), own Redis prefixes so it never shares a bucket with student login.
   */
  adminAuthLogin: [
    createRateLimiter({ windowMs: ONE_MINUTE_MS, max: 5, keyPrefix: 'admin-auth-login-min', keyGenerator: ipAndEmailKey, passOnStoreError: false }),
    createRateLimiter({ windowMs: ONE_HOUR_MS, max: 20, keyPrefix: 'admin-auth-login-hour', keyGenerator: ipAndEmailKey, passOnStoreError: false }),
    createRateLimiter({ windowMs: ONE_MINUTE_MS, max: 100, keyPrefix: 'admin-auth-login-ip-min', keyGenerator: ipKey, passOnStoreError: false }),
    createRateLimiter({ windowMs: ONE_HOUR_MS, max: 1000, keyPrefix: 'admin-auth-login-ip-hour', keyGenerator: ipKey, passOnStoreError: false }),
  ],
  /** /admin/auth/mfa/verify — 5/min AND 20/hour, keyed by IP + hash(mfaToken). Fails closed (A-L5). */
  adminMfaVerify: [
    createRateLimiter({ windowMs: ONE_MINUTE_MS, max: 5, keyPrefix: 'admin-mfa-verify-min', keyGenerator: ipAndMfaTokenKey, passOnStoreError: false }),
    createRateLimiter({ windowMs: ONE_HOUR_MS, max: 20, keyPrefix: 'admin-mfa-verify-hour', keyGenerator: ipAndMfaTokenKey, passOnStoreError: false }),
  ],
  /** /auth/register — 5/hour, keyed by IP. Fails closed (A-L5): Argon2id hashing makes this route DoS-sensitive. */
  authRegister: [createRateLimiter({ windowMs: ONE_HOUR_MS, max: 5, keyPrefix: 'auth-register', passOnStoreError: false })],
  /**
   * /auth/forgot-password, /auth/resend-verification — 3/hour keyed by IP + email, PLUS (A-M1) a
   * 5/hour cap keyed by the normalised email ALONE: without it, an attacker with a wide-enough
   * IPv6 allocation can rotate addresses to get a fresh IP+email bucket per request and spam one
   * mailbox with reset/verify emails indefinitely. Fails closed (A-L5).
   */
  authForgotPassword: [
    createRateLimiter({ windowMs: ONE_HOUR_MS, max: 3, keyPrefix: 'auth-forgot-password', keyGenerator: ipAndEmailKey, passOnStoreError: false }),
    createRateLimiter({ windowMs: ONE_HOUR_MS, max: 5, keyPrefix: 'auth-forgot-password-email', keyGenerator: emailKey, passOnStoreError: false }),
  ],
  /**
   * `/auth/verify-email`, `/auth/reset-password` (A-L6: previously unlimited) — one-shot, low-
   * frequency actions a real user only ever follows from an emailed link, so an IP-only cap can
   * stay simple; raised from the original 30/min (P19 confirmation-review fix) to the same
   * NAT-tolerant ceiling as the login presets above, for the same reason. Fails closed (A-L5).
   */
  authTokenAction: [createRateLimiter({ windowMs: ONE_MINUTE_MS, max: 60, keyPrefix: 'auth-token-action', keyGenerator: ipKey, passOnStoreError: false })],
  /**
   * `/auth/refresh`, `/auth/logout` (A-L6: previously unlimited) — keyed by the presented refresh
   * cookie itself, not IP (P19 confirmation-review fix: an IP-only key put every session behind a
   * shared campus NAT in one bucket; `AuthProvider` calls `/refresh` on every page load/token
   * expiry for EVERY active session, so that bucket fills from normal traffic alone and starts
   * 429ing — and logging out — everyone else on the IP, not just an attacker). 60/min per session
   * is generous for a route no legitimate client calls anywhere near that often; the much higher
   * per-IP cap only backstops requests with no/garbage cookie (their own separate bucket, see
   * {@link refreshCookieKey}), which real traffic never hits. Fails closed (A-L5).
   */
  authRefreshLogout: [
    createRateLimiter({ windowMs: ONE_MINUTE_MS, max: 60, keyPrefix: 'auth-refresh-logout', keyGenerator: refreshCookieKey, passOnStoreError: false }),
    createRateLimiter({ windowMs: ONE_MINUTE_MS, max: 300, keyPrefix: 'auth-refresh-logout-ip', keyGenerator: ipKey, passOnStoreError: false }),
  ],
  /** /ai/categorize/suggest — 60/min, keyed by userId (daily LLM quota is enforced in the AI module). */
  aiCategorizeSuggest: [
    createRateLimiter({ windowMs: ONE_MINUTE_MS, max: 60, keyPrefix: 'ai-categorize', keyGenerator: userIdKey }),
  ],
  /**
   * /ai/feedback — 60/min, keyed by userId (L4 review fix: it previously relied only on the generic
   * `authenticatedDefault` 300/min preset, giving it no tier-1-rule-teaching-specific limit).
   */
  aiFeedback: [createRateLimiter({ windowMs: ONE_MINUTE_MS, max: 60, keyPrefix: 'ai-feedback', keyGenerator: userIdKey })],
  /** POST /imports — 10/hour, keyed by userId. */
  importsCreate: [createRateLimiter({ windowMs: ONE_HOUR_MS, max: 10, keyPrefix: 'imports-create', keyGenerator: userIdKey })],
  /** /reports/monthly/share — 5/day, keyed by userId. */
  reportsShare: [createRateLimiter({ windowMs: ONE_DAY_MS, max: 5, keyPrefix: 'reports-share', keyGenerator: userIdKey })],
  /** /insights/{month}/regenerate — 3/month, keyed by userId + month. */
  insightsRegenerate: [
    createRateLimiter({ windowMs: THIRTY_DAYS_MS, max: 3, keyPrefix: 'insights-regenerate', keyGenerator: userIdAndMonthKey }),
  ],
  /** Every other authenticated endpoint — 300/min, keyed by userId. */
  authenticatedDefault: [
    createRateLimiter({ windowMs: ONE_MINUTE_MS, max: 300, keyPrefix: 'authenticated-default', keyGenerator: userIdKey }),
  ],
  /**
   * `PATCH /me/password` — 5/15min, keyed by userId (security review 5: `currentPassword` is
   * itself a password guess, so it needs its own tight limiter on top of `authenticatedDefault`
   * and the account-lockout counter in `users.service.changePassword`).
   */
  changePassword: [
    createRateLimiter({ windowMs: 15 * ONE_MINUTE_MS, max: 5, keyPrefix: 'change-password', keyGenerator: userIdKey }),
  ],
  /**
   * `POST /admin/users/:id/send-reset` — 3/hour, keyed by the TARGET user id (route param), not the
   * calling admin (P15 security-fix follow-up, Fix 3): this call bypasses the student-facing
   * `/auth/forgot-password` route's own `authForgotPassword` preset entirely (it calls
   * `authService.forgotPassword` directly), so without this one admin session could otherwise spam
   * a single target with reset emails, each invalidating that target's previous still-valid link.
   * Mounted in addition to (not instead of) the router's existing `authenticatedDefault`.
   */
  adminSendReset: [
    createRateLimiter({
      windowMs: ONE_HOUR_MS,
      max: 3,
      keyPrefix: 'admin-send-reset',
      keyGenerator: (req) => (typeof req.params.id === 'string' ? req.params.id : 'unknown'),
    }),
  ],
  /** `GET /me/export` — 3/day, keyed by userId (docs/spec/09 §9.12: "Xuất dữ liệu bất thường nhiều lần"). */
  meExport: [createRateLimiter({ windowMs: ONE_DAY_MS, max: DATA_EXPORT_MAX_PER_DAY, keyPrefix: 'me-export', keyGenerator: userIdKey })],
  /**
   * `GET /reports/monthly/export` — 10/min, keyed by userId (B-M4: PDF rendering is CPU-bound
   * work with no dedicated limit before this, on top of the general `authenticatedDefault` cap).
   */
  reportsExport: [createRateLimiter({ windowMs: ONE_MINUTE_MS, max: 10, keyPrefix: 'reports-export', keyGenerator: userIdKey })],
} as const;
