/**
 * env.ts
 * Validates every environment variable from docs/spec/10 §11.3 with Zod and exposes a single
 * typed `config` object grouped by concern (app, db, redis, auth, encryption, mail, ai,
 * monitoring). A missing required variable logs a clear, field-by-field report and exits the
 * process (fail fast) — except in `NODE_ENV=test`, where secrets/connection strings that are
 * still unset fall back to fixed, clearly-fake test values so the suite runs without a real
 * `.env` (the DB/Redis integration tests still gate on the *raw* env vars being set, see
 * `tests/setup-env.ts`, so this never makes a skipped integration test run against a fake URL).
 * Main exports: type Config, parseEnv, config
 * Spec: docs/spec/10 §11.3 (environment configuration) · docs/spec/03 §3.2 (backend stack)
 */
import path from 'node:path';
import { DEFAULT_API_PORT, DEFAULT_WEB_PORT, parsePort } from '@campuscoin/shared';
import { z } from 'zod';

// ---- Fixed test-mode fallbacks ---------------------------------------------------------------
// Used ONLY when NODE_ENV=test and the variable is unset. Not secrets: committed to source,
// never used outside the test runner, and never reachable/valid infrastructure.
const TEST_JWT_PRIVATE_KEY_PEM =
  '-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIE7HIoylG3hM4crXVuBepu8paNDRjW6IHwbj5ybIyjrk\n-----END PRIVATE KEY-----\n';
const TEST_JWT_PUBLIC_KEY_PEM =
  '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAKPR7jOruldCR626mDhvpeqHcywg+n/Em5S6DXTKGQfg=\n-----END PUBLIC KEY-----\n';
const TEST_DATA_ENCRYPTION_KEY = 'nfG0fNnc4m/HShWn7ZpSXldZn8KqR5CfXOmvc+9KKrY=';
const TEST_IP_HASH_SECRET = 'dGVzdC1pcC1oYXNoLXNlY3JldC1kby1ub3QtdXNlLWluLXByb2Q=';

/** Turns a one-line `\n`-escaped PEM (as stored in `.env`) back into a real multi-line PEM. */
function normalizePem(value: string): string {
  return value.includes('\\n') ? value.replace(/\\n/g, '\n') : value;
}

/**
 * Extracts the bare email address out of a `"Display Name <addr@x.com>"` or plain `addr@x.com`
 * `MAIL_FROM` value — used as the default `SUPPORT_EMAIL` when that var is not set.
 */
function extractEmailAddress(mailFrom: string): string {
  const angleMatch = /<([^>]+)>/.exec(mailFrom);
  return (angleMatch?.[1] ?? mailFrom).trim();
}

/**
 * A-L10: a CORS origin entry must be a real `http(s)://host[:port]` URL. Explicitly rejects the
 * literal string `"null"` (the `Origin` header a sandboxed iframe or a `file:` page sends) and
 * `"*"` — both would otherwise pass a naive "is this a non-empty string" check and, combined with
 * the CSRF guard's `Origin`/`X-Requested-With` check, let a hostile `file:`/sandboxed page's
 * request be accepted as same-origin.
 */
function isValidCorsOrigin(origin: string): boolean {
  if (origin === 'null' || origin === '*') return false;
  try {
    return new URL(origin).protocol === 'http:' || new URL(origin).protocol === 'https:';
  } catch {
    return false;
  }
}

/** A-L10: `DATA_ENCRYPTION_KEY` must base64-decode to exactly 32 bytes (AES-256-GCM key length,
 * see `lib/crypto.ts`'s `getKey`) — validated at boot instead of only surfacing as a 500 the first
 * time `encrypt`/`decrypt` runs (first admin login). */
function decodesToAesKeyLength(base64Value: string): boolean {
  try {
    return Buffer.from(base64Value, 'base64').length === 32;
  } catch {
    return false;
  }
}

/**
 * Builds the Zod schema for `raw` env vars. Field-level leniency (test-only defaults) is decided
 * once, from `raw.NODE_ENV`, before the schema is constructed.
 * @param isTestEnv - true when validating for `NODE_ENV=test`.
 */
function buildSchema(isTestEnv: boolean) {
  /** Required string in dev/prod; falls back to `testValue` only when `isTestEnv`. */
  const requiredOr = (testValue: string) =>
    isTestEnv ? z.string().default(testValue) : z.string().min(1);

  return z.object({
    // ---- Application ---------------------------------------------------------------------
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    API_PORT: z
      .string()
      .optional()
      .transform((v, ctx) => {
        try {
          return parsePort(v, DEFAULT_API_PORT, 'API_PORT');
        } catch (err) {
          ctx.addIssue({ code: 'custom', message: (err as Error).message });
          return z.NEVER;
        }
      }),
    WEB_PORT: z
      .string()
      .optional()
      .transform((v, ctx) => {
        try {
          return parsePort(v, DEFAULT_WEB_PORT, 'WEB_PORT');
        } catch (err) {
          ctx.addIssue({ code: 'custom', message: (err as Error).message });
          return z.NEVER;
        }
      }),
    APP_URL: requiredOr('http://localhost:5174').pipe(z.url()),
    API_URL: requiredOr('http://localhost:3000').pipe(z.url()),
    CORS_ORIGINS: requiredOr('http://localhost:5174')
      .transform((v) =>
        v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      )
      // A-L10: every entry must be a real http(s) URL — never the literal "null" or a "*" wildcard.
      .refine((origins) => origins.every(isValidCorsOrigin), {
        message: 'CORS_ORIGINS must be a comma-separated list of http(s) URLs (not "null" or "*").',
      }),

    // ---- Database --------------------------------------------------------------------------
    DATABASE_URL: requiredOr('mysql://test:test@127.0.0.1:3306/campus_coin_test'),

    // ---- Redis -------------------------------------------------------------------------------
    REDIS_URL: requiredOr('redis://127.0.0.1:6379'),

    // ---- Authentication ------------------------------------------------------------------
    JWT_PRIVATE_KEY: requiredOr(TEST_JWT_PRIVATE_KEY_PEM).transform(normalizePem),
    JWT_PUBLIC_KEY: requiredOr(TEST_JWT_PUBLIC_KEY_PEM).transform(normalizePem),
    JWT_KID: requiredOr('test-kid'),
    ACCESS_TOKEN_TTL: z.string().min(1).default('15m'),
    REFRESH_TOKEN_TTL: z.string().min(1).default('7d'),
    IP_HASH_SECRET: requiredOr(TEST_IP_HASH_SECRET).pipe(z.string().min(16)),
    // HaveIBeenPwned range check on register/change-password (BR-AU-02). Off by default in tests
    // so the suite never makes a real network call. `z.coerce.boolean()` would treat the string
    // "false" as truthy, so parse the literal 'true'/'false' strings instead.
    HIBP_ENABLED: z
      .enum(['true', 'false'])
      .optional()
      .default(isTestEnv ? 'false' : 'true')
      .transform((v) => v === 'true'),
    // Optional seed admin account, read by the P02 seed script; auth code never trusts these
    // directly for authorization, only to bootstrap the very first admin user.
    ADMIN_EMAIL: z.string().optional().default(''),
    ADMIN_PASSWORD: z.string().optional().default(''),

    // ---- Field encryption ------------------------------------------------------------------
    // A-L10: must base64-decode to exactly 32 bytes (AES-256-GCM) — `.min(16)` alone let an
    // invalid key through validation, only to fail at first `encrypt()`/`decrypt()` call.
    DATA_ENCRYPTION_KEY: requiredOr(TEST_DATA_ENCRYPTION_KEY)
      .pipe(z.string().min(16))
      .refine(decodesToAesKeyLength, {
        message: 'DATA_ENCRYPTION_KEY must be base64 and decode to exactly 32 bytes.',
      }),
    DATA_ENCRYPTION_KEY_VERSION: z.coerce.number().int().positive().default(1),

    // ---- Email -------------------------------------------------------------------------------
    SMTP_HOST: requiredOr('localhost'),
    SMTP_PORT: isTestEnv
      ? z.coerce.number().int().min(1).max(65_535).default(1025)
      : z.coerce.number().int().min(1).max(65_535),
    SMTP_USER: z.string().optional().default(''),
    SMTP_PASS: z.string().optional().default(''),
    MAIL_FROM: requiredOr('CampusCoin Test <test@campuscoin.local>'),
    // Shown in the account-deletion email ("contact support within 30 days to cancel"); defaults
    // to MAIL_FROM's own address so a fresh install needs no extra configuration (P16).
    SUPPORT_EMAIL: z.string().optional().default(''),

    // ---- AI (provider-agnostic; empty AI_API_KEY = no-AI / fallback mode) -------------------
    AI_PROVIDER: z.enum(['gemini', 'openai']).default('gemini'),
    AI_API_KEY: z.string().optional().default(''),
    AI_MODEL: z.string().optional().default(''),
    AI_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),
    // D2: 200/day/user (spec default) — the previous 500 default drifted from spec, fixed in P10.
    AI_DAILY_QUOTA: z.coerce.number().int().positive().default(200),

    // ---- Monitoring --------------------------------------------------------------------------
    SENTRY_DSN: z.string().optional().default(''),
    SENTRY_ENV: z.string().optional().default(isTestEnv ? 'test' : 'development'),

    // ---- Privacy & data lifecycle (P16) -----------------------------------------------------
    /** Directory the `cleanup.expired` job writes archived (>12mo) audit-log `.jsonl.gz` files to. */
    AUDIT_ARCHIVE_DIR: z.string().optional().default('backups/audit'),
  }).superRefine((v, ctx) => {
    // A configured API key with no model selected would silently fail every LLM call at request
    // time; catch it at boot instead (P10).
    if (v.AI_API_KEY !== '' && v.AI_MODEL === '') {
      ctx.addIssue({ code: 'custom', path: ['AI_MODEL'], message: 'AI_MODEL is required when AI_API_KEY is set.' });
    }
  });
}

/** Fully validated, typed application configuration. */
export interface Config {
  app: {
    nodeEnv: 'development' | 'test' | 'production';
    isDev: boolean;
    isTest: boolean;
    isProd: boolean;
    port: number;
    webPort: number;
    appUrl: string;
    apiUrl: string;
    corsOrigins: string[];
    logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  };
  db: { url: string };
  redis: { url: string };
  auth: {
    jwtPrivateKey: string;
    jwtPublicKey: string;
    jwtKid: string;
    accessTokenTtl: string;
    refreshTokenTtl: string;
    ipHashSecret: string;
    hibpEnabled: boolean;
    adminEmail: string;
    adminPassword: string;
  };
  encryption: { dataEncryptionKey: string; dataEncryptionKeyVersion: number };
  mail: {
    smtpHost: string;
    smtpPort: number;
    smtpUser: string;
    smtpPass: string;
    mailFrom: string;
    /** Contact address shown in privacy-sensitive emails (account deletion); defaults to `mailFrom`'s address. */
    supportEmail: string;
  };
  ai: {
    provider: 'gemini' | 'openai';
    apiKey: string;
    model: string;
    timeoutMs: number;
    dailyQuota: number;
  };
  monitoring: { sentryDsn: string; sentryEnv: string };
  privacy: {
    /** Absolute path the `cleanup.expired` job writes archived audit-log files to. */
    auditArchiveDir: string;
  };
}

/**
 * Parses and validates raw env vars into a typed {@link Config}.
 * @param raw - Usually `process.env`; a plain object in tests.
 * @throws Error listing every invalid/missing field (never a raw ZodError with internals).
 */
export function parseEnv(raw: NodeJS.ProcessEnv): Config {
  // C-L6: the fixed test-mode fallbacks (JWT keypair, DATA_ENCRYPTION_KEY, IP_HASH_SECRET) must
  // never apply just because NODE_ENV=test was set on a real deployment by accident — that would
  // boot the app with a forgeable, publicly-known JWT signing key. Also require the real process
  // to look like an actual test runner (Vitest sets VITEST=true; CI is the common CI-provider
  // convention), checked against the real process env, not `raw` (which may be a synthetic object
  // in a unit test that still runs inside a genuine `vitest` process).
  const isTestEnv = raw.NODE_ENV === 'test' && Boolean(process.env.VITEST || process.env.CI);
  const result = buildSchema(isTestEnv).safeParse(raw);
  if (!result.success) {
    const lines = result.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  const env = result.data;
  const nodeEnv = env.NODE_ENV;
  return {
    app: {
      nodeEnv,
      isDev: nodeEnv === 'development',
      isTest: nodeEnv === 'test',
      isProd: nodeEnv === 'production',
      port: env.API_PORT,
      webPort: env.WEB_PORT,
      appUrl: env.APP_URL,
      apiUrl: env.API_URL,
      corsOrigins: env.CORS_ORIGINS,
      logLevel: env.LOG_LEVEL,
    },
    db: { url: env.DATABASE_URL },
    redis: { url: env.REDIS_URL },
    auth: {
      jwtPrivateKey: env.JWT_PRIVATE_KEY,
      jwtPublicKey: env.JWT_PUBLIC_KEY,
      jwtKid: env.JWT_KID,
      accessTokenTtl: env.ACCESS_TOKEN_TTL,
      refreshTokenTtl: env.REFRESH_TOKEN_TTL,
      ipHashSecret: env.IP_HASH_SECRET,
      hibpEnabled: env.HIBP_ENABLED,
      adminEmail: env.ADMIN_EMAIL,
      adminPassword: env.ADMIN_PASSWORD,
    },
    encryption: {
      dataEncryptionKey: env.DATA_ENCRYPTION_KEY,
      dataEncryptionKeyVersion: env.DATA_ENCRYPTION_KEY_VERSION,
    },
    mail: {
      smtpHost: env.SMTP_HOST,
      smtpPort: env.SMTP_PORT,
      smtpUser: env.SMTP_USER,
      smtpPass: env.SMTP_PASS,
      mailFrom: env.MAIL_FROM,
      supportEmail: env.SUPPORT_EMAIL || extractEmailAddress(env.MAIL_FROM),
    },
    ai: {
      provider: env.AI_PROVIDER,
      apiKey: env.AI_API_KEY,
      model: env.AI_MODEL,
      timeoutMs: env.AI_TIMEOUT_MS,
      dailyQuota: env.AI_DAILY_QUOTA,
    },
    monitoring: { sentryDsn: env.SENTRY_DSN, sentryEnv: env.SENTRY_ENV },
    privacy: { auditArchiveDir: path.resolve(env.AUDIT_ARCHIVE_DIR) },
  };
}

function loadConfig(): Config {
  try {
    return parseEnv(process.env);
  } catch (err) {
    // Fail fast with a readable report; never a raw stack trace of internals.
    console.error(`[config] ${(err as Error).message}`);
    process.exit(1);
  }
}

// Lazy singleton (mirrors lib/prisma.ts): validated on first property access, so importing this
// module never crashes a process/test that does not actually need config.
const globalForConfig = globalThis as unknown as { __campuscoinConfig?: Config };

/** Process-wide validated configuration, computed on first access. */
export const config: Config = new Proxy({} as Config, {
  get(_target, prop) {
    globalForConfig.__campuscoinConfig ??= loadConfig();
    return Reflect.get(globalForConfig.__campuscoinConfig, prop);
  },
});
