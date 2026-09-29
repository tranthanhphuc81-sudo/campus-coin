/**
 * crypto.test.ts
 * Unit tests for backend/src/lib/crypto.ts: encrypt/decrypt round-trip, tamper detection
 * (auth tag failure), and rejection of an unknown key version byte.
 * Spec: docs/spec/09 §9.9 (field encryption) · Rules: BR-AU-09
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decrypt, encrypt, hashRecoveryCode } from '../../../src/lib/crypto.js';

describe('encrypt / decrypt', () => {
  it('round-trips a plaintext string', () => {
    const ciphertext = encrypt('super-secret-totp-key');
    expect(decrypt(ciphertext)).toBe('super-secret-totp-key');
  });

  it('produces different ciphertext for the same plaintext (random IV)', () => {
    const a = encrypt('same-plaintext');
    const b = encrypt('same-plaintext');
    expect(a.equals(b)).toBe(false);
  });

  it('throws when the ciphertext is tampered with', () => {
    const ciphertext = encrypt('super-secret-totp-key');
    const tampered = Buffer.from(ciphertext);
    const lastIndex = tampered.length - 1;
    // Buffer index is `length - 1`, never client input.
    // eslint-disable-next-line security/detect-object-injection
    tampered[lastIndex] = (tampered[lastIndex] ?? 0) ^ 0xff;
    expect(() => decrypt(tampered)).toThrow();
  });

  it('throws on an unsupported key version byte', () => {
    const ciphertext = encrypt('super-secret-totp-key');
    const wrongVersion = Buffer.from(ciphertext);
    wrongVersion[0] = 99;
    expect(() => decrypt(wrongVersion)).toThrow(/key version/);
  });
});

describe('hashRecoveryCode', () => {
  it('is deterministic for the same code and different for different codes', () => {
    const a = hashRecoveryCode('ABCDEFGHJKMN');
    const b = hashRecoveryCode('ABCDEFGHJKMN');
    const c = hashRecoveryCode('PQRSTUVWXYZ2');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('is not plain SHA-256 of the code (pepper actually changes the output)', () => {
    const plainSha256 = createHash('sha256').update('ABCDEFGHJKMN', 'utf8').digest('hex');
    expect(hashRecoveryCode('ABCDEFGHJKMN')).not.toBe(plainSha256);
  });
});
