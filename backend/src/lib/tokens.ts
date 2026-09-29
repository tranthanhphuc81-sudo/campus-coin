/**
 * tokens.ts
 * Opaque, cryptographically random tokens used outside JWTs: email verification, password
 * reset, refresh-token secrets, MFA recovery codes. Tokens are never stored in plaintext —
 * callers persist `sha256Hex(token)` and compare hashes (BR-AU-04: token storage).
 * Main exports: generateToken, sha256Hex, generateRecoveryCode, normalizeRecoveryCode
 * Spec: docs/spec/09 §9.6 (tokens) · Rules: BR-AU-04
 */
import { createHash, randomBytes, randomInt } from 'node:crypto';

/** Unambiguous 31-symbol alphabet for recovery codes: excludes `0/O`, `1/I/L` (visually confusable
 * when handwritten/read aloud) — not related to vowels, despite an earlier comment claiming so. */
const RECOVERY_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
/** Recovery codes are formatted `xxxxxx-xxxxxx` (12 alphabet characters + one separator, ~59 bits
 * of entropy from the 31-symbol alphabet — bumped from 10 chars after a security review). */
const RECOVERY_CODE_GROUP_LENGTH = 6;

/**
 * Generates a random opaque token: 32 bytes of CSPRNG output, base64url-encoded (43 chars,
 * no padding). Used for email-verification / password-reset links and refresh-token secrets.
 */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Hashes a token (or any secret) with SHA-256, hex-encoded. Used to store a verifiable but
 * non-reversible representation of a token — the plaintext is only ever emailed/returned once.
 * @param value - Plaintext token.
 */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * Generates one MFA recovery code, formatted `xxxxx-xxxxx` from an unambiguous 32-symbol
 * alphabet. Uses `crypto.randomInt` (rejection-sampling under the hood), so there is no modulo
 * bias despite the alphabet size (32) not evenly dividing 256.
 */
export function generateRecoveryCode(): string {
  const chars = Array.from({ length: RECOVERY_CODE_GROUP_LENGTH * 2 }, () =>
    RECOVERY_CODE_ALPHABET[randomInt(RECOVERY_CODE_ALPHABET.length)],
  );
  return `${chars.slice(0, RECOVERY_CODE_GROUP_LENGTH).join('')}-${chars.slice(RECOVERY_CODE_GROUP_LENGTH).join('')}`;
}

/**
 * Normalises a user-typed recovery code for comparison: upper-cases and strips everything
 * except the alphabet characters (so `abcde fghjk`, `ABCDE-FGHJK` and `abcde-fghjk` all match).
 * @param value - Raw user input.
 */
export function normalizeRecoveryCode(value: string): string {
  return value
    .toUpperCase()
    .split('')
    .filter((ch) => RECOVERY_CODE_ALPHABET.includes(ch))
    .join('');
}
