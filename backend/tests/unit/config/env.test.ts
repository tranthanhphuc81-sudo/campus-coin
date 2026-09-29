/**
 * env.test.ts
 * Unit tests for `parseEnv` (backend/src/config/env.ts): fails fast with every missing field
 * listed when required vars are absent, succeeds with real values, and — the mechanism that lets
 * the rest of the suite run without a `.env` file — falls back to fixed test values when
 * `NODE_ENV=test` and a field is unset.
 * Spec: docs/spec/10 §11.3 (environment configuration)
 */
import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../../src/config/env.js';

const FULL_ENV: NodeJS.ProcessEnv = {
  NODE_ENV: 'production',
  API_PORT: '3000',
  WEB_PORT: '5174',
  APP_URL: 'https://app.example.com',
  API_URL: 'https://api.example.com',
  CORS_ORIGINS: 'https://app.example.com,https://admin.example.com',
  DATABASE_URL: 'mysql://user:pass@localhost:3306/campus_coin',
  REDIS_URL: 'redis://:pass@localhost:6379',
  JWT_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----',
  JWT_PUBLIC_KEY: '-----BEGIN PUBLIC KEY-----\\nabc\\n-----END PUBLIC KEY-----',
  JWT_KID: 'kid-1',
  IP_HASH_SECRET: 'a-secret-that-is-long-enough',
  // A-L10: must base64-decode to exactly 32 bytes (AES-256-GCM key length).
  DATA_ENCRYPTION_KEY: 'nfG0fNnc4m/HShWn7ZpSXldZn8KqR5CfXOmvc+9KKrY=',
  SMTP_HOST: 'smtp.example.com',
  SMTP_PORT: '587',
  MAIL_FROM: 'CampusCoin <no-reply@example.com>',
};

describe('parseEnv', () => {
  it('parses a fully-specified environment into a typed config', () => {
    const config = parseEnv(FULL_ENV);

    expect(config.app.nodeEnv).toBe('production');
    expect(config.app.port).toBe(3000);
    expect(config.app.corsOrigins).toEqual(['https://app.example.com', 'https://admin.example.com']);
    expect(config.db.url).toBe(FULL_ENV.DATABASE_URL);
    // \n escapes are turned back into real newlines.
    expect(config.auth.jwtPrivateKey).toBe('-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----');
    expect(config.mail.smtpPort).toBe(587);
    expect(config.ai.apiKey).toBe(''); // AI_API_KEY may be empty (no-AI mode)
  });

  it('fails fast, listing every missing required field, when NODE_ENV is not test', () => {
    expect(() => parseEnv({ NODE_ENV: 'development' })).toThrowError(/DATABASE_URL/);
  });

  it('reports multiple missing fields at once', () => {
    try {
      parseEnv({ NODE_ENV: 'production' });
      expect.unreachable();
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toMatch(/DATABASE_URL/);
      expect(message).toMatch(/REDIS_URL/);
      expect(message).toMatch(/JWT_PRIVATE_KEY/);
    }
  });

  it('falls back to fixed test values in NODE_ENV=test, so the suite needs no real .env', () => {
    const config = parseEnv({ NODE_ENV: 'test' });

    expect(config.app.nodeEnv).toBe('test');
    expect(config.db.url).toBeTruthy();
    expect(config.redis.url).toBeTruthy();
    expect(config.auth.jwtPrivateKey).toContain('BEGIN PRIVATE KEY');
    expect(config.auth.jwtPublicKey).toContain('BEGIN PUBLIC KEY');
  });

  it('rejects an out-of-range AI_TIMEOUT_MS while still applying test defaults elsewhere', () => {
    expect(() => parseEnv({ NODE_ENV: 'test', AI_TIMEOUT_MS: '-5' })).toThrowError(/AI_TIMEOUT_MS/);
  });

  it('defaults AI_DAILY_QUOTA to 200 (D2: matches spec, not the old 500)', () => {
    const config = parseEnv({ NODE_ENV: 'test' });
    expect(config.ai.dailyQuota).toBe(200);
  });

  it('rejects an AI_API_KEY set without an AI_MODEL', () => {
    expect(() => parseEnv({ NODE_ENV: 'test', AI_API_KEY: 'some-key', AI_MODEL: '' })).toThrowError(/AI_MODEL/);
  });

  it('accepts an AI_API_KEY set together with an AI_MODEL', () => {
    const config = parseEnv({ NODE_ENV: 'test', AI_API_KEY: 'some-key', AI_MODEL: 'gemini-flash-latest' });
    expect(config.ai.apiKey).toBe('some-key');
    expect(config.ai.model).toBe('gemini-flash-latest');
  });

  it('A-L10: rejects a CORS_ORIGINS entry of the literal "null"', () => {
    expect(() => parseEnv({ ...FULL_ENV, CORS_ORIGINS: 'https://app.example.com,null' })).toThrowError(
      /CORS_ORIGINS/,
    );
  });

  it('A-L10: rejects a CORS_ORIGINS entry of "*"', () => {
    expect(() => parseEnv({ ...FULL_ENV, CORS_ORIGINS: '*' })).toThrowError(/CORS_ORIGINS/);
  });

  it('A-L10: rejects a CORS_ORIGINS entry that is not a valid URL', () => {
    expect(() => parseEnv({ ...FULL_ENV, CORS_ORIGINS: 'not-a-url' })).toThrowError(/CORS_ORIGINS/);
  });

  it('A-L10: rejects a DATA_ENCRYPTION_KEY that does not decode to exactly 32 bytes', () => {
    expect(() =>
      parseEnv({ ...FULL_ENV, DATA_ENCRYPTION_KEY: 'dG9vLXNob3J0LWtleQ==' /* "too-short-key", 13 bytes */ }),
    ).toThrowError(/DATA_ENCRYPTION_KEY/);
  });

  it('C-L6: NODE_ENV=test without VITEST/CI set on the real process does NOT get the fixed test fallbacks', () => {
    const originalVitest = process.env.VITEST;
    const originalCi = process.env.CI;
    delete process.env.VITEST;
    delete process.env.CI;
    try {
      expect(() => parseEnv({ NODE_ENV: 'test' })).toThrowError(/DATABASE_URL/);
    } finally {
      if (originalVitest !== undefined) process.env.VITEST = originalVitest;
      if (originalCi !== undefined) process.env.CI = originalCi;
    }
  });
});
