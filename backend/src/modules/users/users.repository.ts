/**
 * users.repository.ts
 * Prisma access for the authenticated caller's own `User` row: `/api/v1/me/*`. Every method is
 * already scoped to a single `userId` argument taken from the verified token — callers must never
 * pass an id that didn't come from `req.auth.userId` (CLAUDE.md: never trust client params for
 * ownership).
 * Main exports: usersRepository, UpdateProfileData
 * Spec: docs/spec/07 §7.3.1 (users/me) · Rules: BR-AU-01 (mass-assignment whitelist)
 */
import type { Prisma } from '../../generated/prisma/client.js';
import type { Decimal } from '../../lib/money.js';
import type { AppPrismaClient } from '../../lib/prisma.js';
import { prisma } from '../../lib/prisma.js';

/** Fields {@link usersRepository.updateProfile} accepts — already mapped from the validated body. */
export interface UpdateProfileData {
  fullName?: string;
  academicYear?: string | null;
  monthlyAllowanceBaseline?: Decimal | null;
  monthlySavingsGoal?: Decimal | null;
  currency?: string;
  timezone?: string;
  preferences?: Prisma.InputJsonValue;
  aiOptIn?: boolean;
}

export const usersRepository = {
  /** Finds a user by id, or null. */
  findById(userId: string, db: AppPrismaClient = prisma) {
    return db.user.findUnique({ where: { id: userId } });
  },

  /** Applies a partial profile update; only keys present in `data` are touched. */
  updateProfile(userId: string, data: UpdateProfileData, db: AppPrismaClient = prisma) {
    return db.user.update({ where: { id: userId }, data });
  },

  /** Sets a new password hash (authenticated "change my password" flow, not a reset). */
  updatePassword(userId: string, passwordHash: string, db: AppPrismaClient = prisma) {
    return db.user.update({ where: { id: userId }, data: { passwordHash } });
  },
};
