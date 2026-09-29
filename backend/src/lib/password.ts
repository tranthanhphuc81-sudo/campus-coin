/**
 * password.ts
 * Argon2id password hashing helpers. Parameters follow OWASP's Argon2id baseline (memoryCost
 * 19 MiB, timeCost 2, parallelism 1) — BR-AU-02. `verifyPassword` never throws: a malformed hash
 * (e.g. legacy data, corruption) is treated as "does not match", never as a 500.
 * Main exports: hashPassword, verifyPassword, passwordNeedsRehash, dummyVerify
 * Spec: docs/spec/09 §9.2 (password storage) · Rules: BR-AU-02, BR-AU-03 (timing-safe login)
 */
import argon2 from 'argon2';

/** Argon2id parameters used for every new hash. Bump here (not per call-site) to re-tune cost. */
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456, // ~19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

/**
 * Hashes a plaintext password with Argon2id.
 * @param plain - Plaintext password (already length-validated by the Zod schema).
 * @returns The encoded Argon2 hash string, safe to store in `users.password_hash`.
 */
export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTIONS);
}

/**
 * Verifies a plaintext password against a stored Argon2 hash.
 * @param hash - Encoded hash from `users.password_hash`.
 * @param plain - Plaintext password supplied by the client.
 * @returns true when they match; false on mismatch **or** a malformed/foreign hash format
 *   (never throws, so callers don't need a try/catch on every login attempt).
 */
export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

/**
 * Tells whether a stored hash was created with different parameters than {@link ARGON2_OPTIONS}
 * (e.g. after tuning the cost). Callers should re-hash and persist on next successful login.
 * @param hash - Encoded hash from `users.password_hash`.
 */
export function passwordNeedsRehash(hash: string): boolean {
  return argon2.needsRehash(hash, ARGON2_OPTIONS);
}

// BR-AU-03: computed lazily (once) so an unknown-email login still spends ~the same time as a
// real Argon2 verify, closing the user-enumeration timing side-channel.
let dummyHash: Promise<string> | undefined;

/**
 * Verifies a fixed dummy password against a lazily-computed dummy hash. Callers use this on the
 * "user not found" branch of login so success/failure paths take a similar amount of time.
 */
export async function dummyVerify(): Promise<void> {
  dummyHash ??= hashPassword('dummy-password-for-timing-safety');
  await verifyPassword(await dummyHash, 'dummy-password-for-timing-safety');
}
