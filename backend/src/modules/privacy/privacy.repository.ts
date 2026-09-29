/**
 * privacy.repository.ts
 * Prisma access backing `GET /me/export` (read-only) and `DELETE /me` (`requestDeletion`)
 * (docs/spec/09 §9.14). Every query is scoped by `userId` taken from the verified token (CLAUDE.md
 * cross-tenant invariant) — this module never accepts a client-supplied id. Transactions are read
 * INCLUDING soft-deleted rows (an export is a full data dump, not the normal "active only" view).
 * Main exports: privacyRepository
 * Spec: docs/spec/09 §9.14 (data portability, right to erasure)
 */
import { UserStatus } from '@campuscoin/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AppPrismaClient } from '../../lib/prisma.js';
import { prisma } from '../../lib/prisma.js';

export const privacyRepository = {
  /**
   * `DELETE /me`: disables the account and stamps `deletedAt` — conditional on `deletedAt: null`
   * so a second call (or a retry after a crash) is a harmless no-op instead of resetting the
   * 30-day grace period clock.
   */
  requestDeletion(userId: string, now: Date, db: AppPrismaClient = prisma): Promise<Prisma.BatchPayload> {
    return db.user.updateMany({ where: { id: userId, deletedAt: null }, data: { status: UserStatus.DISABLED, deletedAt: now } });
  },

  /** All of the caller's categories (active + archived) — no soft-delete concept on this model. */
  categories(userId: string, db: AppPrismaClient = prisma) {
    return db.category.findMany({ where: { userId }, orderBy: { id: 'asc' } });
  },

  /** Every transaction the caller has ever created, INCLUDING soft-deleted ones (full data export). */
  transactions(userId: string, db: AppPrismaClient = prisma) {
    return db.transaction.findMany({ where: { userId }, include: { category: true }, orderBy: { id: 'asc' } });
  },

  /** All of the caller's budgets, with their category for display. */
  budgets(userId: string, db: AppPrismaClient = prisma) {
    return db.budget.findMany({ where: { userId }, include: { category: true }, orderBy: { id: 'asc' } });
  },

  /** All of the caller's recurring rules, with their category for display. */
  recurringRules(userId: string, db: AppPrismaClient = prisma) {
    return db.recurringRule.findMany({ where: { userId }, include: { category: true }, orderBy: { id: 'asc' } });
  },

  /** All of the caller's learned tier-1 AI merchant->category rules. */
  aiCategoryRules(userId: string, db: AppPrismaClient = prisma) {
    return db.aiCategoryRule.findMany({ where: { userId }, orderBy: { id: 'asc' } });
  },

  /** All of the caller's generated monthly insights. */
  insights(userId: string, db: AppPrismaClient = prisma) {
    return db.insight.findMany({ where: { userId }, orderBy: { id: 'asc' } });
  },

  /** All of the caller's generated savings tips. */
  userTips(userId: string, db: AppPrismaClient = prisma) {
    return db.userTip.findMany({ where: { userId }, orderBy: { id: 'asc' } });
  },

  /** All of the caller's bookmarks. */
  bookmarks(userId: string, db: AppPrismaClient = prisma) {
    return db.bookmark.findMany({ where: { userId }, orderBy: { id: 'asc' } });
  },

  /** All of the caller's CSV import batches (metadata only — row previews live in Redis, 24h TTL). */
  importBatches(userId: string, db: AppPrismaClient = prisma) {
    return db.importBatch.findMany({ where: { userId }, orderBy: { id: 'asc' } });
  },
};
