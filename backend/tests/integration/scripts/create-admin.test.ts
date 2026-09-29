/**
 * create-admin.test.ts
 * Integration tests (needs MySQL) for `scripts/create-admin.ts`'s `bootstrapAdmin` (A-M4): a fresh
 * admin is created already MFA-enrolled (encrypted secret + 10 hashed recovery codes persisted),
 * a second call is idempotent and never regenerates the secret, a pre-A-M4 admin row with no
 * secret gets enrolled on the next run, and an existing non-admin email is refused.
 * Spec: docs/spec/09 §9.5 (MFA row) · Rules: BR-AU-01, BR-AU-02, BR-AU-09
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Role, UserStatus } from '@campuscoin/shared';
import { randomUUID } from 'node:crypto';
import { bootstrapAdmin } from '../../../src/scripts/create-admin.js';
import { decrypt } from '../../../src/lib/crypto.js';
import { hashPassword } from '../../../src/lib/password.js';
import { createPrismaClient, type AppPrismaClient } from '../../../src/lib/prisma.js';

const createdIds: string[] = [];

function uniqueAdminEmail(): string {
  return `create-admin-${randomUUID()}@test.local`;
}

describe.skipIf(!process.env.DATABASE_URL)('scripts/create-admin.ts bootstrapAdmin', () => {
  let prisma: AppPrismaClient;

  beforeAll(() => {
    prisma = createPrismaClient();
  });

  afterEach(async () => {
    if (createdIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdIds } } });
      createdIds.length = 0;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates a brand-new admin already MFA-enrolled (encrypted secret + 10 hashed recovery codes)', async () => {
    const email = uniqueAdminEmail();
    const passwordHash = await hashPassword('irrelevant-for-this-test');

    const result = await bootstrapAdmin(prisma, email, passwordHash);
    expect(result.status).toBe('created');
    if (result.status !== 'created') throw new Error('unreachable');
    createdIds.push(result.userId);

    const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: result.userId } });
    expect(dbUser.role).toBe(Role.ADMIN);
    expect(dbUser.status).toBe(UserStatus.ACTIVE);
    expect(dbUser.mfaSecretEnc).not.toBeNull();

    // The decrypted secret must be a plausible Base32 TOTP secret, never stored/returned in the clear.
    const secret = decrypt(Buffer.from(dbUser.mfaSecretEnc as Uint8Array));
    expect(secret.length).toBeGreaterThan(10);
    expect(Buffer.from(dbUser.mfaSecretEnc as Uint8Array).toString('utf8')).not.toContain(secret);

    const codes = dbUser.mfaRecoveryCodes as unknown as string[];
    expect(codes).toHaveLength(10);
  });

  it('A-M4: a second bootstrap call for the same already-enrolled admin is a no-op — the secret is never regenerated', async () => {
    const email = uniqueAdminEmail();
    const passwordHash = await hashPassword('irrelevant-for-this-test');

    const first = await bootstrapAdmin(prisma, email, passwordHash);
    if (first.status !== 'created') throw new Error('unreachable');
    createdIds.push(first.userId);
    const afterFirst = await prisma.user.findUniqueOrThrow({ where: { id: first.userId } });

    const second = await bootstrapAdmin(prisma, email, passwordHash);
    expect(second.status).toBe('already-enrolled');
    const afterSecond = await prisma.user.findUniqueOrThrow({ where: { id: first.userId } });

    // Byte-identical ciphertext proves the secret was never touched (a re-encrypt would change the
    // random IV even if the underlying secret happened to be regenerated identically).
    expect(Buffer.from(afterSecond.mfaSecretEnc as Uint8Array).equals(Buffer.from(afterFirst.mfaSecretEnc as Uint8Array))).toBe(
      true,
    );
  });

  it('A-M4: an existing admin row with no MFA secret yet (pre-A-M4) gets enrolled on the next bootstrap call', async () => {
    const email = uniqueAdminEmail();
    const passwordHash = await hashPassword('irrelevant-for-this-test');
    const created = await prisma.user.create({
      data: { email, passwordHash, fullName: 'Legacy Admin', role: Role.ADMIN, status: UserStatus.ACTIVE, emailVerifiedAt: new Date() },
    });
    createdIds.push(created.id);
    expect(created.mfaSecretEnc).toBeNull();

    const result = await bootstrapAdmin(prisma, email, passwordHash);
    expect(result.status).toBe('enrolled-now');

    const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: created.id } });
    expect(dbUser.mfaSecretEnc).not.toBeNull();
  });

  it('refuses to touch an existing non-admin account with the same email', async () => {
    const email = uniqueAdminEmail();
    const passwordHash = await hashPassword('irrelevant-for-this-test');
    const created = await prisma.user.create({
      data: { email, passwordHash, fullName: 'Existing Student', role: Role.STUDENT, status: UserStatus.ACTIVE, emailVerifiedAt: new Date() },
    });
    createdIds.push(created.id);

    const result = await bootstrapAdmin(prisma, email, passwordHash);
    expect(result.status).toBe('exists-non-admin');

    const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: created.id } });
    expect(dbUser.role).toBe(Role.STUDENT);
    expect(dbUser.mfaSecretEnc).toBeNull();
  });
});
