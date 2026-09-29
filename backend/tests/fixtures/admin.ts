/**
 * admin.ts (fixtures)
 * Shared helpers for `tests/integration/admin/*`: admin accounts with a known TOTP secret (or no
 * secret at all, to exercise the enrolment flow), a matching recovery-code fixture, a one-call
 * "log in as this admin" helper (P15), and cleanup.
 * Spec: docs/spec/12 (testing plan)
 */
import type { Express } from 'express';
import { generate } from 'otplib';
import request from 'supertest';
import type { Prisma } from '../../src/generated/prisma/client.js';
import { Role, UserStatus } from '@campuscoin/shared';
import { encrypt, hashRecoveryCode } from '../../src/lib/crypto.js';
import { hashPassword } from '../../src/lib/password.js';
import { prisma } from '../../src/lib/prisma.js';
import { generateRecoveryCode, normalizeRecoveryCode } from '../../src/lib/tokens.js';
import { generateTotpSecret } from '../../src/lib/totp.js';
import { STRONG_PASSWORD, uniqueEmail } from './auth.js';

const createdAdminIds: string[] = [];

/** A test admin/student account (credentials only). */
export interface TestAdmin {
  id: string;
  email: string;
  password: string;
}

/** A test admin already enrolled in MFA, with its plaintext TOTP secret for generating codes. */
export interface TestAdminWithSecret extends TestAdmin {
  secret: string;
}

/** A test admin with both a known TOTP secret and a fixed set of plaintext recovery codes. */
export interface TestAdminWithRecoveryCodes extends TestAdminWithSecret {
  recoveryCodes: string[];
}

/**
 * Creates an active admin with no TOTP secret yet (A-M4: pre-enrolment / a bootstrap-skipped row —
 * `scripts/create-admin.ts` normally enrolls MFA before the row can ever log in). Its next login
 * now fails closed (401) rather than offering open enrolment; see `admin-auth.test.ts`.
 */
export async function createAdminForEnrolment(
  overrides: Partial<{ email: string; password: string }> = {},
): Promise<TestAdmin> {
  const email = overrides.email ?? uniqueEmail();
  const password = overrides.password ?? STRONG_PASSWORD;
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      fullName: 'Test Admin',
      role: Role.ADMIN,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
    },
  });
  createdAdminIds.push(user.id);
  return { id: user.id, email, password };
}

/** Creates an active admin already enrolled with a known (plaintext, for test use) TOTP secret. */
export async function createAdminWithTotp(
  overrides: Partial<{ email: string; password: string }> = {},
): Promise<TestAdminWithSecret> {
  const base = await createAdminForEnrolment(overrides);
  const secret = generateTotpSecret();
  await prisma.user.update({
    where: { id: base.id },
    data: { mfaSecretEnc: encrypt(secret) as unknown as Uint8Array<ArrayBuffer> },
  });
  return { ...base, secret };
}

/** Creates an active admin with a known TOTP secret plus a fixed, known set of recovery codes. */
export async function createAdminWithRecoveryCodes(
  overrides: Partial<{ email: string; password: string }> = {},
): Promise<TestAdminWithRecoveryCodes> {
  const admin = await createAdminWithTotp(overrides);
  const recoveryCodes = Array.from({ length: 3 }, () => generateRecoveryCode());
  const hashes = recoveryCodes.map((c) => hashRecoveryCode(normalizeRecoveryCode(c)));
  await prisma.user.update({
    where: { id: admin.id },
    data: { mfaRecoveryCodes: hashes as unknown as Prisma.InputJsonValue },
  });
  return { ...admin, recoveryCodes };
}

/** Creates an active *student* account, for cross-role admin-login tests (TC-07). */
export async function createStudentForAdminTests(): Promise<TestAdmin> {
  const email = uniqueEmail();
  const password = STRONG_PASSWORD;
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { email, passwordHash, fullName: 'Test Student', status: UserStatus.ACTIVE, emailVerifiedAt: new Date() },
  });
  createdAdminIds.push(user.id);
  return { id: user.id, email, password };
}

/**
 * Logs a TOTP-enrolled test admin (from {@link createAdminWithTotp}) through the full
 * login -> `mfa/verify` flow and returns its Bearer access token (P15 admin-portal test suites).
 */
export async function loginAsAdmin(app: Express, admin: TestAdminWithSecret): Promise<string> {
  const loginRes = await request(app)
    .post('/api/v1/admin/auth/login')
    .send({ email: admin.email, password: admin.password });
  const code = await generate({ secret: admin.secret });
  const verifyRes = await request(app)
    .post('/api/v1/admin/auth/mfa/verify')
    .send({ mfaToken: loginRes.body.mfaToken, code });
  return verifyRes.body.accessToken as string;
}

/** Deletes every admin/student account tracked by this fixture module. */
export async function cleanupTestAdmins(): Promise<void> {
  if (createdAdminIds.length === 0) return;
  await prisma.user.deleteMany({ where: { id: { in: createdAdminIds } } });
  createdAdminIds.length = 0;
}
