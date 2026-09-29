/**
 * forecast.repository.ts
 * Prisma access for `GET /forecast/next-month` (docs/spec/05c §5.14): per-category+type summed
 * totals for one basis month, and whether that month has any transaction at all (data-availability
 * only, not part of any total). Every method takes `userId` directly in its `where` (CLAUDE.md:
 * never trust client params for ownership). Recurring-rule lookups deliberately live in
 * `recurring.service.ts` instead, not here — this module never reaches into another module's
 * repository directly (CLAUDE.md: modules talk to each other via services only).
 * Main exports: forecastRepository, MonthlyCategoryTotal
 * Spec: docs/spec/05c §5.14
 */
import type { TransactionType } from '@campuscoin/shared';
import { toDbDate, type LocalDate } from '../../lib/dates.js';
import { Decimal } from '../../lib/money.js';
import type { AppPrismaClient } from '../../lib/prisma.js';
import { prisma } from '../../lib/prisma.js';

/** Either the shared client or a transaction handle — every method accepts both. */
type Db = AppPrismaClient;

/** One category+type combination's summed total for one basis month. */
export interface MonthlyCategoryTotal {
  categoryId: number;
  type: TransactionType;
  amount: Decimal;
}

export const forecastRepository = {
  /**
   * Per-category, per-type summed totals for one calendar month, excluding recurring-generated
   * transactions (`recurringRuleId: null`) — avoids double-counting against the "known recurring"
   * amount the service adds on top of the weighted moving average.
   */
  async monthlyTotalsByCategory(userId: string, monthStart: LocalDate, monthEnd: LocalDate, db: Db = prisma): Promise<MonthlyCategoryTotal[]> {
    const rows = await db.transaction.groupBy({
      by: ['categoryId', 'type'],
      where: { userId, deletedAt: null, recurringRuleId: null, txnDate: { gte: toDbDate(monthStart), lte: toDbDate(monthEnd) } },
      _sum: { amount: true },
    });
    return rows.map((row) => ({ categoryId: row.categoryId, type: row.type as TransactionType, amount: row._sum.amount ?? new Decimal(0) }));
  },

  /**
   * Whether `userId` has ANY transaction (any source, any category) in this month — used only to
   * tell "no data at all" apart from "genuinely spent/earned nothing" when building each category's
   * `history` entries, never to compute a total itself.
   */
  async hasAnyTransactionInMonth(userId: string, monthStart: LocalDate, monthEnd: LocalDate, db: Db = prisma): Promise<boolean> {
    const count = await db.transaction.count({
      where: { userId, deletedAt: null, txnDate: { gte: toDbDate(monthStart), lte: toDbDate(monthEnd) } },
    });
    return count > 0;
  },
};
