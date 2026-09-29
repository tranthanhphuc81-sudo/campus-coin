/**
 * activity.repository.ts
 * Prisma access for the recent-activity feature (docs/spec/05c §5.14): records a
 * viewed/edited row per transaction (deduped, newest-wins) and trims each user down to
 * {@link RECENT_ACTIVITY_MAX_PER_USER} rows. Every method takes `userId` and scopes by it
 * (CLAUDE.md: never trust client params for ownership).
 * Main exports: activityRepository, RecentActivityWithTransaction
 * Spec: docs/spec/05c §5.14
 */
import { RECENT_ACTIVITY_MAX_PER_USER, type RecentActivityAction } from '@campuscoin/shared';
import type { CategoryModel } from '../../generated/prisma/models/Category.js';
import type { RecentActivityModel } from '../../generated/prisma/models/RecentActivity.js';
import type { TransactionModel } from '../../generated/prisma/models/Transaction.js';
import { prisma } from '../../lib/prisma.js';

/** A `RecentActivity` row joined with its transaction (and the transaction's category). */
export type RecentActivityWithTransaction = RecentActivityModel & {
  transaction: TransactionModel & { category: CategoryModel };
};

export const activityRepository = {
  /**
   * Records one viewed/edited row for `transactionId` and trims `userId`'s history back down to
   * {@link RECENT_ACTIVITY_MAX_PER_USER} rows, all inside one DB transaction:
   *   1. Deletes any existing row for this exact `(userId, transactionId)` pair — dedups so
   *      re-viewing the same transaction repeatedly does not fill every slot with itself.
   *   2. Inserts the new row.
   *   3. Finds the id of the row at the cutoff (ordered by the monotonic BigInt `id`, not
   *      `occurredAt`, to avoid ties on same-millisecond writes) and deletes everything at or
   *      before it.
   * Concurrent calls for the same user may transiently leave slightly more than
   * {@link RECENT_ACTIVITY_MAX_PER_USER} rows; the next write always converges back to the cap —
   * an acceptable tradeoff for never blocking/erroring on this best-effort feature.
   */
  async recordAndTrim(userId: string, transactionId: string, action: RecentActivityAction): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.recentActivity.deleteMany({ where: { userId, transactionId } });
      await tx.recentActivity.create({ data: { userId, transactionId, action } });
      const cutoff = await tx.recentActivity.findFirst({
        where: { userId },
        orderBy: { id: 'desc' },
        skip: RECENT_ACTIVITY_MAX_PER_USER,
        select: { id: true },
      });
      if (cutoff) {
        await tx.recentActivity.deleteMany({ where: { userId, id: { lte: cutoff.id } } });
      }
    });
  },

  /**
   * The `limit` most recent activity rows of `userId`, newest first, joined with their (still
   * active) transaction and category. Because the join requires `transaction.deletedAt: null`, a
   * soft-deleted transaction's activity row is naturally hidden without any extra cleanup.
   */
  listRecent(userId: string, limit: number): Promise<RecentActivityWithTransaction[]> {
    return prisma.recentActivity.findMany({
      where: { userId, transaction: { userId, deletedAt: null } },
      orderBy: { id: 'desc' },
      take: limit,
      include: { transaction: { include: { category: true } } },
    });
  },
};
