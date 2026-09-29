/**
 * auth.repository.ts
 * Prisma access for registration/login/verify-email/resend flows: user lookup by email, account
 * creation (role/status always fixed server-side, never from client input — BR-AU-01), lockout
 * counters, and `AuthToken` (verify_email) rows.
 * Main exports: authRepository
 * Spec: docs/spec/09 §9.1–9.3 · Rules: BR-AU-01..04
 */
import { Role, UserStatus } from '@campuscoin/shared';
// AuthTokenPurpose is a backend-internal enum (never sent to the client), so it comes from the
// generated Prisma enums rather than shared/src/enums.ts (PROGRESS.md P07+ convention).
import type { AuthTokenPurpose } from '../../generated/prisma/enums.js';
import type { AppPrismaClient } from '../../lib/prisma.js';
import { prisma } from '../../lib/prisma.js';

/** Fields accepted when creating a brand-new account (role/status are never client-supplied). */
export interface CreateUserInput {
  email: string;
  passwordHash: string;
  fullName: string;
}

export const authRepository = {
  /** Finds a user by (already lower-cased) email, or null. */
  findByEmail(email: string, db: AppPrismaClient = prisma) {
    return db.user.findUnique({ where: { email } });
  },

  findById(id: string, db: AppPrismaClient = prisma) {
    return db.user.findUnique({ where: { id } });
  },

  /** Creates a new student account, always `role: student`, `status: pending` — BR-AU-01. */
  createUser(input: CreateUserInput, db: AppPrismaClient = prisma) {
    return db.user.create({
      data: { ...input, role: Role.STUDENT, status: UserStatus.PENDING },
    });
  },

  /** Atomically increments the failed-login counter (capped at 255, the column's UnsignedTinyInt max). */
  async incrementFailedLoginCount(userId: string, db: AppPrismaClient = prisma): Promise<number> {
    const user = await db.user.update({
      where: { id: userId },
      data: { failedLoginCount: { increment: 1 } },
      select: { failedLoginCount: true },
    });
    if (user.failedLoginCount > 255) {
      await db.user.update({ where: { id: userId }, data: { failedLoginCount: 255 } });
      return 255;
    }
    return user.failedLoginCount;
  },

  lockAccount(userId: string, lockedUntil: Date, db: AppPrismaClient = prisma) {
    return db.user.update({ where: { id: userId }, data: { lockedUntil } });
  },

  /** Resets lockout state and records a successful login; optionally rehashes the password. */
  recordSuccessfulLogin(
    userId: string,
    fields: { newPasswordHash?: string },
    db: AppPrismaClient = prisma,
  ) {
    return db.user.update({
      where: { id: userId },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        ...(fields.newPasswordHash ? { passwordHash: fields.newPasswordHash } : {}),
      },
    });
  },

  /** Activates a pending account. Race-safe `updateMany`: a no-op (count 0) if already active. */
  activate(userId: string, db: AppPrismaClient = prisma) {
    return db.user.updateMany({
      where: { id: userId, status: UserStatus.PENDING },
      data: { status: UserStatus.ACTIVE, emailVerifiedAt: new Date() },
    });
  },

  /** Creates a purpose-scoped one-time token row; only the SHA-256 hash is stored (BR-AU-04). */
  createAuthToken(
    input: { userId: string; purpose: AuthTokenPurpose; tokenHash: string; expiresAt: Date },
    db: AppPrismaClient = prisma,
  ) {
    return db.authToken.create({ data: input });
  },

  /** Finds an unused, unexpired token by its SHA-256 hash + purpose. */
  findActiveAuthToken(tokenHash: string, purpose: AuthTokenPurpose, now: Date, db: AppPrismaClient = prisma) {
    return db.authToken.findFirst({
      where: { tokenHash, purpose, usedAt: null, expiresAt: { gt: now } },
    });
  },

  /** Single-use consume: race-safe `updateMany` — returns the number of rows actually consumed (0 or 1). */
  consumeAuthToken(id: bigint, now: Date, db: AppPrismaClient = prisma) {
    return db.authToken.updateMany({ where: { id, usedAt: null }, data: { usedAt: now } });
  },

  /** Invalidates every still-usable token of a purpose for a user (e.g. before issuing a new one). */
  invalidateUnusedTokens(userId: string, purpose: AuthTokenPurpose, now: Date, db: AppPrismaClient = prisma) {
    return db.authToken.updateMany({ where: { userId, purpose, usedAt: null }, data: { usedAt: now } });
  },

  /** Sets a new password hash and clears lockout state (password-reset completion). */
  resetPasswordAndUnlock(userId: string, passwordHash: string, db: AppPrismaClient = prisma) {
    return db.user.update({
      where: { id: userId },
      data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
    });
  },

  /**
   * Sets a new password hash only — no lockout/lastLogin side effects. Used for the transparent
   * Argon2 rehash-on-login of an *admin* account, where resetting the failed-login counter must
   * wait until MFA also succeeds (security review: closes a brute-force loop across the
   * password + MFA steps).
   */
  rehashPassword(userId: string, passwordHash: string, db: AppPrismaClient = prisma) {
    return db.user.update({ where: { id: userId }, data: { passwordHash } });
  },
};
