/**
 * admin-auth.repository.ts
 * Prisma access for the admin MFA verification flow: race-safe recovery-code consumption and the
 * final "login completed" state update. Enrolment itself (persisting the encrypted TOTP secret +
 * recovery-code hashes) happens once, out-of-band, in `scripts/create-admin.ts` (P19 A-M4) — never
 * over the login response. Plain email/id lookups are reused from `modules/auth`
 * (`authRepository`) rather than duplicated here.
 * Main exports: adminAuthRepository
 * Spec: docs/spec/09 §9.5 (MFA row) · Rules: BR-AU-09
 */
import type { Prisma } from '../../generated/prisma/client.js';
import type { AppPrismaClient } from '../../lib/prisma.js';
import { prisma } from '../../lib/prisma.js';

export const adminAuthRepository = {
  /**
   * Removes one recovery-code hash from `mfaRecoveryCodes`, conditioned on the column still
   * equalling `oldCodes` exactly — a concurrent verify that already consumed the same code (or
   * any other recovery code) leaves this a no-op (`count` is 0), so the caller can fail closed
   * instead of silently double-spending a code.
   */
  async removeRecoveryCode(
    userId: string,
    oldCodes: string[],
    newCodes: string[],
    db: AppPrismaClient = prisma,
  ): Promise<boolean> {
    const result = await db.user.updateMany({
      where: { id: userId, mfaRecoveryCodes: { equals: oldCodes as unknown as Prisma.InputJsonValue } },
      data: { mfaRecoveryCodes: newCodes as unknown as Prisma.InputJsonValue },
    });
    return result.count > 0;
  },

  /** Resets lockout state and records the final (MFA-completed) login timestamp. */
  completeLogin(userId: string, db: AppPrismaClient = prisma) {
    return db.user.update({
      where: { id: userId },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
  },
};
