/**
 * dashboard.repository.ts
 * Prisma access backing `GET /dashboard/summary`. Every aggregate is computed with a single
 * grouped SQL aggregation (`groupBy`/`aggregate`), never by pulling transaction rows into Node to
 * sum them (docs/spec/10 §10.2).
 * Main exports: dashboardRepository, MonthTotals, CategoryAmount
 * Spec: docs/spec/05b §5.7 (dashboard widgets) · docs/spec/10 §10.2 (SQL aggregation)
 */
import { TransactionType } from '@campuscoin/shared';
import type { CategoryModel } from '../../generated/prisma/models/Category.js';
import { lastDayOfMonth, toDbDate, type LocalDate } from '../../lib/dates.js';
import { Decimal } from '../../lib/money.js';
import type { AppPrismaClient } from '../../lib/prisma.js';
import { prisma } from '../../lib/prisma.js';

/** Either the shared client or a transaction handle — every method accepts both. */
type Db = AppPrismaClient;

/** Income/expense totals for one month. */
export interface MonthTotals {
  income: Decimal;
  expense: Decimal;
}

/** One category's summed amount, used by the top-category and breakdown widgets. */
export interface CategoryAmount {
  categoryId: number;
  amount: Decimal;
}

export const dashboardRepository = {
  /** SUM of income and SUM of expense (non-deleted) for `userId`+`month`, in one grouped query. */
  async totalsForMonth(userId: string, month: LocalDate, db: Db = prisma): Promise<MonthTotals> {
    const rows = await db.transaction.groupBy({
      by: ['type'],
      where: { userId, deletedAt: null, txnDate: { gte: toDbDate(month), lte: toDbDate(lastDayOfMonth(month)) } },
      _sum: { amount: true },
    });
    const income = rows.find((row) => row.type === TransactionType.INCOME)?._sum.amount ?? new Decimal(0);
    const expense = rows.find((row) => row.type === TransactionType.EXPENSE)?._sum.amount ?? new Decimal(0);
    return { income, expense };
  },

  /** SUM of non-deleted expense per category for `userId`+`month`, highest first. */
  async expenseByCategory(userId: string, month: LocalDate, db: Db = prisma): Promise<CategoryAmount[]> {
    const rows = await db.transaction.groupBy({
      by: ['categoryId'],
      where: {
        userId,
        type: TransactionType.EXPENSE,
        deletedAt: null,
        txnDate: { gte: toDbDate(month), lte: toDbDate(lastDayOfMonth(month)) },
      },
      _sum: { amount: true },
      orderBy: { _sum: { amount: 'desc' } },
    });
    return rows.map((row) => ({ categoryId: row.categoryId, amount: row._sum.amount ?? new Decimal(0) }));
  },

  /** Looks up category display fields (name/icon/color) for a set of ids. */
  async categoriesByIds(ids: number[], db: Db = prisma): Promise<Map<number, CategoryModel>> {
    if (ids.length === 0) return new Map();
    const rows = await db.category.findMany({ where: { id: { in: ids } } });
    return new Map(rows.map((row) => [row.id, row]));
  },
};
