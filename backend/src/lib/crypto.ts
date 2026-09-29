/**
 * crypto.ts
 * AES-256-GCM field-level encryption for sensitive columns (e.g. MFA TOTP secrets), plus a
 * pepper-keyed HMAC for MFA recovery codes. Ciphertext layout: `[1 byte key version][12 byte
 * IV][16 byte auth tag][ciphertext]`, so a future key rotation can keep decrypting old rows by
 * version while re-encrypting on next write. The recovery-code pepper is derived from
 * `DATA_ENCRYPTION_KEY` via HKDF — it is never stored anywhere, so a stolen `mfaRecoveryCodes`
 * column alone (without also having `DATA_ENCRYPTION_KEY`) cannot be offline-brute-forced with a
 * plain SHA-256 rainbow table (security review finding).
 * Main exports: encrypt, decrypt, hashRecoveryCode
 * Spec: docs/spec/09 §9.9 (field encryption) · Rules: BR-AU-09
 */
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';
import { config } from '../config/env.js';

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const VERSION_BYTES = 1;

/** HKDF `info` label for the recovery-code pepper — versioned so it can be rotated independently later. */
const RECOVERY_PEPPER_INFO = 'campuscoin:mfa-recovery-pepper:v1';
/** Pepper length, in bytes (matches the HMAC-SHA256 block use case). */
const RECOVERY_PEPPER_BYTES = 32;

/**
 * Decodes and validates `DATA_ENCRYPTION_KEY` (must be exactly 32 bytes once base64-decoded).
 * A-L10: `config/env.ts` already rejects a wrong-length key at process boot (fail fast, like every
 * other required var) — this check is kept as defense-in-depth so a bug in that boot validation
 * can never turn into a silent truncated/padded-key encryption bug here.
 */
function getKey(): Buffer {
  const key = Buffer.from(config.encryption.dataEncryptionKey, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new Error(`DATA_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes, got ${key.length}`);
  }
  return key;
}

/**
 * Encrypts `plaintext` with AES-256-GCM under the current key version.
 * @param plaintext - Sensitive string to encrypt (e.g. a TOTP secret).
 * @returns `[version][iv][tag][ciphertext]` as a single Buffer, ready to store in a BLOB column.
 */
export function encrypt(plaintext: string): Buffer {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const version = Buffer.from([config.encryption.dataEncryptionKeyVersion]);
  return Buffer.concat([version, iv, tag, ciphertext]);
}

/**
 * Decrypts a Buffer produced by {@link encrypt}.
 * @param data - `[version][iv][tag][ciphertext]`.
 * @throws Error if the key version doesn't match the current key (key rotation with a keyring
 *   of old keys is future work — TODO(p04): support decrypting previous key versions), the
 *   buffer is too short, or the GCM auth tag fails to verify (tampered/corrupted data).
 */
export function decrypt(data: Buffer): string {
  if (data.length < VERSION_BYTES + IV_BYTES + TAG_BYTES) {
    throw new Error('Ciphertext buffer is too short to be valid');
  }
  const version = data[0];
  if (version !== config.encryption.dataEncryptionKeyVersion) {
    throw new Error(`Unsupported data encryption key version: ${version}`);
  }
  const iv = data.subarray(VERSION_BYTES, VERSION_BYTES + IV_BYTES);
  const tag = data.subarray(VERSION_BYTES + IV_BYTES, VERSION_BYTES + IV_BYTES + TAG_BYTES);
  const ciphertext = data.subarray(VERSION_BYTES + IV_BYTES + TAG_BYTES);
  const key = getKey();
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/**
 * Derives the recovery-code pepper from `DATA_ENCRYPTION_KEY` via HKDF-SHA256. Deterministic (same
 * key + info always yields the same pepper) but never persisted anywhere — an attacker needs both
 * the DB dump *and* `DATA_ENCRYPTION_KEY` to attempt an offline guess against a recovery code.
 */
function getRecoveryPepper(): Buffer {
  const key = Buffer.from(config.encryption.dataEncryptionKey, 'base64');
  return Buffer.from(hkdfSync('sha256', key, Buffer.alloc(0), RECOVERY_PEPPER_INFO, RECOVERY_PEPPER_BYTES));
}

/**
 * Hashes a normalised MFA recovery code with HMAC-SHA256 under the {@link getRecoveryPepper}
 * pepper. Callers must pass an already-{@link normalizeRecoveryCode}-d value so the same code
 * always hashes identically regardless of how the user typed it.
 * @param normalizedCode - Output of `normalizeRecoveryCode`.
 */
export function hashRecoveryCode(normalizedCode: string): string {
  return createHmac('sha256', getRecoveryPepper()).update(normalizedCode, 'utf8').digest('hex');
}
