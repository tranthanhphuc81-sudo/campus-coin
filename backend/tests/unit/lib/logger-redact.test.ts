/**
 * logger-redact.test.ts
 * Unit test for the redaction config in lib/logger.ts (C-L1): builds a real pino instance with
 * this project's exact `REDACT_PATHS`, logs a nested object, and asserts secrets 2+ levels deep
 * are actually redacted (the old config only matched 1 level deep) while `err.code` — narrowed
 * away from the old blanket `code`/`*.code` entries — survives for debugging.
 * Spec: docs/security/review-p19.md C-L1
 */
import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import pino from 'pino';
import { REDACT_PATHS } from '../../../src/lib/logger.js';

/** A pino destination that just accumulates every written line (parsed JSON) in `lines`. */
function collectingLogger(): { logger: pino.Logger; lines: () => Record<string, unknown>[] } {
  const raw: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _enc, callback) {
      raw.push(chunk.toString());
      callback();
    },
  });
  const logger = pino({ redact: { paths: REDACT_PATHS, censor: '[redacted]' } }, stream);
  return { logger, lines: () => raw.map((line) => JSON.parse(line) as Record<string, unknown>) };
}

describe('logger REDACT_PATHS (C-L1)', () => {
  it('redacts req.body.token and req.body.mfaCode (3 levels deep)', () => {
    const { logger, lines } = collectingLogger();
    logger.info({ req: { body: { token: 'super-secret-token', mfaCode: '123456' } } }, 'nested secrets');

    const entry = lines()[0]!;
    const req = entry.req as { body: { token: string; mfaCode: string } };
    expect(req.body.token).toBe('[redacted]');
    expect(req.body.mfaCode).toBe('[redacted]');
  });

  it('redacts passwordHash 2 and 3 levels deep', () => {
    const { logger, lines } = collectingLogger();
    logger.info(
      { user: { passwordHash: 'argon2id$top-level' }, account: { profile: { passwordHash: 'argon2id$nested' } } },
      'nested password hashes',
    );

    const entry = lines()[0]!;
    expect((entry.user as { passwordHash: string }).passwordHash).toBe('[redacted]');
    expect((entry.account as { profile: { passwordHash: string } }).profile.passwordHash).toBe('[redacted]');
  });

  it('redacts mfaSecretEnc and tokenHash', () => {
    const { logger, lines } = collectingLogger();
    logger.info({ admin: { mfaSecretEnc: 'enc-blob' }, session: { tokenHash: 'sha256-hex' } }, 'other secrets');

    const entry = lines()[0]!;
    expect((entry.admin as { mfaSecretEnc: string }).mfaSecretEnc).toBe('[redacted]');
    expect((entry.session as { tokenHash: string }).tokenHash).toBe('[redacted]');
  });

  it('does NOT redact err.code (narrowed from the old blanket code/*.code entries)', () => {
    const { logger, lines } = collectingLogger();
    logger.info({ err: { code: 'ECONNREFUSED', message: 'connect failed' } }, 'connection error');

    const entry = lines()[0]!;
    expect((entry.err as { code: string }).code).toBe('ECONNREFUSED');
  });

  it('still redacts the MFA-code request-body field (body.code) without hiding err.code', () => {
    const { logger, lines } = collectingLogger();
    logger.info({ req: { body: { code: '654321' } }, err: { code: 'ETIMEDOUT' } }, 'mixed code fields');

    const entry = lines()[0]!;
    expect((entry.req as { body: { code: string } }).body.code).toBe('[redacted]');
    expect((entry.err as { code: string }).code).toBe('ETIMEDOUT');
  });
});
