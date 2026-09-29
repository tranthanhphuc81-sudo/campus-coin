/**
 * reports.repository.ts
 * Prisma access backing `/reports/*`. Every aggregate is computed with a single grouped SQL
 * aggregation (`groupBy`), never by pulling transaction rows into Node to sum them (docs/spec/10
 * §10.2), mirroring `dashboard.repository.ts`. Queries rely on the `(user_id, txn_date)` and
 * `(user_id, category_id, txn_date)` indexes (docs/spec/06 §6.4, docs/spec/05b §5.8).
 * Main exports: reportsRepository, RangeTotals, CategoryAmountCount, DailyAmounts
 * Spec: docs/spec/05b §5.8 · docs/spec/10 §10.2 (SQL aggregation)
 */
import { TransactionType } from '@campuscoin/shared';
import { toDbDate, type LocalDate } from '../../lib/dates.js';
import { Decimal } from '../../lib/money.js';
import type { AppPrismaClient } from '../../lib/prisma.js';
import { prisma } from '../../lib/prisma.js';

/** Either the shared client or a transaction handle — every method accepts both. */
type Db = AppPrismaClient;

/** Income/expense totals over an arbitrary date range. */
export interface RangeTotals {
  income: Decimal;
  expense: Decimal;
}

/** One category's summed amount + transaction count within a date range. */
export interface CategoryAmountCount {
  categoryId: number;
  amount: Decimal;
  count: number;
}

/** One calendar day's income/expense totals. */
export interface DailyAmounts {
  date: LocalDate;
  income: Decimal;
  expense: Decimal;
}

/** Optional filters shared by category-scoped report queries. */
export interface CategoryReportFilters {
  type?: TransactionType;
  categoryIds?: number[];
}

export const reportsRepository = {
  /** SUM of income and SUM of expense (non-deleted) for `userId` within `[from, to]` inclusive. */
  async totalsForRange(userId: string, from: LocalDate, to: LocalDate, db: Db = prisma): Promise<RangeTotals> {
    const rows = await db.transaction.groupBy({
      by: ['type'],
      where: { userId, deletedAt: null, txnDate: { gte: toDbDate(from), lte: toDbDate(to) } },
      _sum: { amount: true },
    });
    const income = rows.find((row) => row.type === TransactionType.INCOME)?._sum.amount ?? new Decimal(0);
    const expense = rows.find((row) => row.type === TransactionType.EXPENSE)?._sum.amount ?? new Decimal(0);
    return { income, expense };
  },

  /** SUM + COUNT of non-deleted transactions per category within `[from, to]`, highest amount first. */
  async byCategoryForRange(
    userId: string,
    from: LocalDate,
    to: LocalDate,
    filters: CategoryReportFilters,
    db: Db = prisma,
  ): Promise<CategoryAmountCount[]> {
    const rows = await db.transaction.groupBy({
      by: ['categoryId'],
      where: {
        userId,
        deletedAt: null,
        txnDate: { gte: toDbDate(from), lte: toDbDate(to) },
        ...(filters.type ? { type: filters.type } : {}),
        ...(filters.categoryIds ? { categoryId: { in: filters.categoryIds } } : {}),
      },
      _sum: { amount: true },
      _count: { _all: true },
      orderBy: { _sum: { amount: 'desc' } },
    });
    return rows.map((row) => ({ categoryId: row.categoryId, amount: row._sum.amount ?? new Decimal(0), count: row._count._all }));
  },

  /**
   * SUM of income/expense per calendar day for every day in `[from, to]` that has at least one
   * transaction (days with none are simply absent — the caller fills zeros for the full range).
   */
  async dailyTotals(userId: string, from: LocalDate, to: LocalDate, db: Db = prisma): Promise<DailyAmounts[]> {
    const rows = await db.transaction.groupBy({
      by: ['txnDate', 'type'],
      where: { userId, deletedAt: null, txnDate: { gte: toDbDate(from), lte: toDbDate(to) } },
      _sum: { amount: true },
    });

    const byDate = new Map<string, DailyAmounts>();
    for (const row of rows) {
      const date = row.txnDate.toISOString().slice(0, 10);
      const entry = byDate.get(date) ?? { date, income: new Decimal(0), expense: new Decimal(0) };
      const amount = row._sum.amount ?? new Decimal(0);
      if (row.type === TransactionType.INCOME) entry.income = amount;
      else entry.expense = amount;
      byDate.set(date, entry);
    }
    return [...byDate.values()];
  },
};
