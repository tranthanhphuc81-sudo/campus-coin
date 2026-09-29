/**
 * password.test.ts
 * Unit tests for backend/src/lib/password.ts: hash/verify round-trip, rehash detection, dummy
 * verify (timing-safety helper) and that verify never throws on a malformed hash.
 * Spec: docs/spec/09 §9.2 (password storage) · Rules: BR-AU-02, BR-AU-03
 */
import { describe, expect, it } from 'vitest';
import { dummyVerify, hashPassword, passwordNeedsRehash, verifyPassword } from '../../../src/lib/password.js';

describe('password', () => {
  it('hashes a password and verifies the correct plaintext', async () => {
    const hash = await hashPassword('correct-horse-battery');
    await expect(verifyPassword(hash, 'correct-horse-battery')).resolves.toBe(true);
  });

  it('rejects the wrong plaintext', async () => {
    const hash = await hashPassword('correct-horse-battery');
    await expect(verifyPassword(hash, 'wrong-password')).resolves.toBe(false);
  });

  it('never throws on a malformed hash', async () => {
    await expect(verifyPassword('not-a-real-argon2-hash', 'anything')).resolves.toBe(false);
    await expect(verifyPassword('', 'anything')).resolves.toBe(false);
  });

  it('does not flag a freshly hashed password as needing rehash', async () => {
    const hash = await hashPassword('correct-horse-battery');
    expect(passwordNeedsRehash(hash)).toBe(false);
  });

  it('flags a hash created with different parameters as needing rehash', async () => {
    // Simulate an "old" hash: same algorithm, cheaper memory cost.
    const argon2 = (await import('argon2')).default;
    const oldHash = await argon2.hash('correct-horse-battery', { type: argon2.argon2id, memoryCost: 1024, timeCost: 1, parallelism: 1 });
    expect(passwordNeedsRehash(oldHash)).toBe(true);
  });

  it('dummyVerify resolves without throwing (timing-safety helper)', async () => {
    await expect(dummyVerify()).resolves.toBeUndefined();
  });
});
