/**
 * budgets.repository.ts
 * Prisma access for monthly per-category budgets and the SQL aggregation used to compute their
 * consumption. Every function that targets a *specific user's* row takes `userId` and scopes by
 * it (CLAUDE.md: never trust client params for ownership) — a budget owned by another user is
 * simply never matched, which is how the service layer turns cross-tenant access into a 404
 * instead of a 403. Consumption is always computed with a single grouped SQL aggregation
 * (`groupBy`/`aggregate`), never by pulling transaction rows into Node to sum them.
 * Main exports: budgetsRepository, BudgetWithCategory, Db
 * Spec: docs/spec/05c §5.11 (budgets & alerts) · docs/spec/10 §10.2 (SQL aggregation)
 */
import { TransactionType } from '@campuscoin/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import type { BudgetModel } from '../../generated/prisma/models/Budget.js';
import type { CategoryModel } from '../../generated/prisma/models/Category.js';
import { lastDayOfMonth, toDbDate, type LocalDate } from '../../lib/dates.js';
import { Decimal } from '../../lib/money.js';
import type { AppPrismaClient } from '../../lib/prisma.js';
import { prisma } from '../../lib/prisma.js';

/** Either the shared client or a transaction handle — every method accepts both. */
export type Db = AppPrismaClient | Prisma.TransactionClient;

/** A `Budget` row read with its `category` relation included. */
export type BudgetWithCategory = BudgetModel & { category: CategoryModel };

/** Fields accepted by {@link budgetsRepository.upsert}. */
export interface UpsertBudgetData {
  userId: string;
  categoryId: number;
  month: LocalDate;
  limitAmount: Decimal;
  alertThresholdPct: number;
}

export const budgetsRepository = {
  /** Every budget a user has for one month, with its category joined. */
  listByUserMonth(userId: string, month: LocalDate, db: Db = prisma): Promise<BudgetWithCategory[]> {
    return db.budget.findMany({
      where: { userId, month: toDbDate(month) },
      include: { category: true },
      orderBy: { categoryId: 'asc' },
    });
  },

  /** A budget owned by `userId` — never matches another user's row (gives the 404). */
  findOwned(id: number, userId: string, db: Db = prisma): Promise<BudgetWithCategory | null> {
    return db.budget.findFirst({ where: { id, userId }, include: { category: true } });
  },

  /** The one budget for a given user+category+month, or null (used by the budget-alert handler). */
  findByUserCategoryMonth(userId: string, categoryId: number, month: LocalDate, db: Db = prisma): Promise<BudgetModel | null> {
    return db.budget.findUnique({ where: { userId_categoryId_month: { userId, categoryId, month: toDbDate(month) } } });
  },

  /** Creates or updates the one budget for a user+category+month (BR-BU-01: PUT /budgets is idempotent). */
  upsert(data: UpsertBudgetData, db: Db = prisma): Promise<BudgetWithCategory> {
    const month = toDbDate(data.month);
    return db.budget.upsert({
      where: { userId_categoryId_month: { userId: data.userId, categoryId: data.categoryId, month } },
      create: { userId: data.userId, categoryId: data.categoryId, month, limitAmount: data.limitAmount, alertThresholdPct: data.alertThresholdPct },
      update: { limitAmount: data.limitAmount, alertThresholdPct: data.alertThresholdPct },
      include: { category: true },
    });
  },

  /** Hard-deletes a budget (ownership must already be verified by the caller). */
  deleteOwned(id: number, userId: string, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.budget.deleteMany({ where: { id, userId } });
  },

  /**
   * SUM of non-deleted expense transactions per category for `userId`+`month`, computed with one
   * grouped SQL aggregation (docs/spec/10 §10.2: never sum raw rows in Node).
   * @returns A map from `categoryId` to its spent total; categories with no spend are absent.
   */
  async spentByCategory(userId: string, month: LocalDate, db: Db = prisma): Promise<Map<number, Decimal>> {
    const rows = await db.transaction.groupBy({
      by: ['categoryId'],
      where: {
        userId,
        type: TransactionType.EXPENSE,
        deletedAt: null,
        txnDate: { gte: toDbDate(month), lte: toDbDate(lastDayOfMonth(month)) },
      },
      _sum: { amount: true },
    });
    const map = new Map<number, Decimal>();
    for (const row of rows) map.set(row.categoryId, row._sum.amount ?? new Decimal(0));
    return map;
  },

  /** SUM of non-deleted expense transactions for one category+month (budget-alert handler). */
  async spentForCategory(userId: string, categoryId: number, month: LocalDate, db: Db = prisma): Promise<Decimal> {
    const result = await db.transaction.aggregate({
      where: {
        userId,
        categoryId,
        type: TransactionType.EXPENSE,
        deletedAt: null,
        txnDate: { gte: toDbDate(month), lte: toDbDate(lastDayOfMonth(month)) },
      },
      _sum: { amount: true },
    });
    return result._sum.amount ?? new Decimal(0);
  },
};
