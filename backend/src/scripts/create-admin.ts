/**
 * create-admin.ts
 * One-off CLI to bootstrap the first admin account from `ADMIN_EMAIL`/`ADMIN_PASSWORD` (config).
 * Idempotent: an existing admin with that email is a no-op (exit 0) UNLESS it has no MFA secret
 * enrolled yet, in which case enrolment is completed now (A-M4 follow-up, see below) — no secret
 * is ever regenerated/re-printed for an admin that already has one. An existing *student* account
 * with that email is a hard error (exit 1) — this script never promotes/overwrites an existing
 * account.
 *
 * A-M4 (P19 security review): MFA enrolment used to happen on the admin's first `/admin/auth/login`
 * — whoever completed it first (knowing only the `.env` password) got to claim the second factor.
 * Enrolment now happens here instead: a fresh TOTP secret + 10 recovery codes are generated,
 * AES-256-GCM encrypted with the same helper `admin-auth.service.ts` uses, and saved directly on
 * the new user row — so the account is already fully enrolled before it can ever log in. The
 * otpauth URL + recovery codes are printed to the console exactly once, in the same
 * `console.info('[create-admin] ...')` / `[seed] ...` style `prisma/seed/demo.ts` already uses for
 * its own demo-admin TOTP info.
 * Usage: `npm run admin:create -w backend` (reads `.env` via `tsx --env-file-if-exists`).
 * Main exports: bootstrapAdmin, type BootstrapAdminResult (both for tests); CLI entry point by default.
 * Spec: docs/spec/09 §9.5 (MFA row) · Rules: BR-AU-01, BR-AU-02, BR-AU-09
 */
import { fileURLToPath } from 'node:url';
import { MFA_RECOVERY_CODE_COUNT, Role, UserStatus } from '@campuscoin/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { config } from '../config/env.js';
import { encrypt, hashRecoveryCode } from '../lib/crypto.js';
import { hashPassword } from '../lib/password.js';
import { checkPasswordPolicy } from '../lib/passwordPolicy.js';
import type { AppPrismaClient } from '../lib/prisma.js';
import { createPrismaClient } from '../lib/prisma.js';
import { generateRecoveryCode, normalizeRecoveryCode } from '../lib/tokens.js';
import { buildOtpauthUrl, generateTotpSecret } from '../lib/totp.js';
import { PASSWORD_POLICY_MESSAGES } from '../modules/auth/auth.service.js';

/** Display name for the bootstrapped account (no `ADMIN_NAME` env var — keep the script minimal). */
const DEFAULT_ADMIN_NAME = 'Administrator';

/** Outcome of {@link bootstrapAdmin}, used both by the CLI's exit-code logic and by tests. */
export type BootstrapAdminResult =
  | { status: 'created'; userId: string }
  | { status: 'already-enrolled'; userId: string }
  | { status: 'enrolled-now'; userId: string }
  | { status: 'exists-non-admin' };

/**
 * Generates a fresh TOTP secret + {@link MFA_RECOVERY_CODE_COUNT} recovery codes for `userId`,
 * persists the encrypted secret + hashed codes, and prints the otpauth URL + plaintext recovery
 * codes to the console exactly once (never retrievable again after this).
 */
async function enrollAndPrintMfa(prisma: AppPrismaClient, userId: string, email: string): Promise<void> {
  const secret = generateTotpSecret();
  const recoveryCodes = Array.from({ length: MFA_RECOVERY_CODE_COUNT }, () => generateRecoveryCode());
  const hashes = recoveryCodes.map((c) => hashRecoveryCode(normalizeRecoveryCode(c)));

  await prisma.user.update({
    where: { id: userId },
    data: {
      mfaSecretEnc: new Uint8Array(encrypt(secret)),
      mfaRecoveryCodes: hashes as unknown as Prisma.InputJsonValue,
    },
  });

  const otpauthUrl = buildOtpauthUrl(secret, email);
  console.info(`[create-admin] MFA enrolled for ${email}. Scan this QR / add this URL to your authenticator app:`);
  console.info(`[create-admin] otpauth URL: ${otpauthUrl}`);
  console.info('[create-admin] One-time recovery codes (shown only once, store them securely):');
  for (const code of recoveryCodes) console.info(`[create-admin]   ${code}`);
}

/**
 * Core bootstrap logic (no `process.exitCode`/console usage besides the enrolment printout above),
 * so it can be exercised directly against a real Prisma client in tests without spawning the CLI.
 * BR-AU-01/BR-AU-02: role is always `ADMIN`/`ACTIVE`, password policy is the caller's
 * responsibility (checked once in `main` before this runs).
 * @param email - Already trimmed + lower-cased.
 * @param passwordHash - Already-hashed bootstrap password (never re-hashed for an existing row).
 */
export async function bootstrapAdmin(
  prisma: AppPrismaClient,
  email: string,
  passwordHash: string,
): Promise<BootstrapAdminResult> {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.role !== Role.ADMIN) return { status: 'exists-non-admin' };
    // A-M4: don't regenerate/re-print a secret for an admin that already has one — only complete
    // enrolment for a pre-A-M4 (or otherwise corrupted) admin row that has none.
    if (existing.mfaSecretEnc) return { status: 'already-enrolled', userId: existing.id };
    await enrollAndPrintMfa(prisma, existing.id, email);
    return { status: 'enrolled-now', userId: existing.id };
  }

  const created = await prisma.user.create({
    data: {
      email,
      passwordHash,
      fullName: DEFAULT_ADMIN_NAME,
      role: Role.ADMIN,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
    },
  });
  await enrollAndPrintMfa(prisma, created.id, email);
  return { status: 'created', userId: created.id };
}

/** Runs the bootstrap; sets `process.exitCode` (never calls `process.exit` directly, so `finally` blocks still run). */
async function main(): Promise<void> {
  const email = config.auth.adminEmail.trim().toLowerCase();
  const password = config.auth.adminPassword;
  if (!email || !password) {
    console.error('[create-admin] ADMIN_EMAIL and ADMIN_PASSWORD must both be set in .env.');
    process.exitCode = 1;
    return;
  }

  // BR-AU-02: the bootstrap admin password must pass the exact same policy as any other account.
  const policy = await checkPasswordPolicy(password, { email });
  if (!policy.ok) {
    console.error(`[create-admin] ADMIN_PASSWORD fails the password policy: ${PASSWORD_POLICY_MESSAGES[policy.reason]}`);
    process.exitCode = 1;
    return;
  }

  const prisma = createPrismaClient();
  try {
    // Never log the password itself, only that one was accepted and hashed.
    const passwordHash = await hashPassword(password);
    const result = await bootstrapAdmin(prisma, email, passwordHash);

    switch (result.status) {
      case 'created':
        console.info(`[create-admin] Created admin account ${email}.`);
        break;
      case 'already-enrolled':
        console.info(`[create-admin] ${email} already exists (admin, MFA enrolled) — nothing to do.`);
        break;
      case 'enrolled-now':
        console.info(`[create-admin] ${email} already exists (admin) but had no MFA secret — enrolled now.`);
        break;
      case 'exists-non-admin':
        console.error(`[create-admin] ${email} already exists as a non-admin account — refusing to overwrite.`);
        process.exitCode = 1;
        break;
    }
  } finally {
    await prisma.$disconnect();
  }
}

// Only auto-run when this file is the actual CLI entry point (`tsx src/scripts/create-admin.ts`),
// never when it's imported for its exports (e.g. `bootstrapAdmin` in tests) — otherwise importing
// this module anywhere would have the side effect of trying to bootstrap a real admin account.
const isCliEntryPoint = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isCliEntryPoint) {
  main().catch((err: unknown) => {
    console.error('[create-admin] failed', err);
    process.exitCode = 1;
  });
}
