/**
 * insights.repository.ts
 * Prisma access backing the monthly AI/template insights engine (docs/spec/05b §5.9). Every
 * aggregate is its own grouped SQL query (`groupBy`/`aggregate`/`findFirst`) — this module never
 * imports `dashboard.repository.ts`/`budgets.repository.ts`, mirroring `reports.repository.ts`'s
 * "every module builds its own aggregates" convention. Every user-data query filters
 * `deletedAt: null` and is scoped by `userId` (CLAUDE.md cross-tenant invariant).
 * Main exports: insightsRepository
 * Spec: docs/spec/05b §5.9 · docs/spec/06 §6 (insights table)
 */
import { INSIGHT_MIN_TRANSACTIONS, TransactionType, type InsightFlaggedPattern } from '@campuscoin/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { InsightGenerator, InsightStatus, UserStatus } from '../../generated/prisma/enums.js';
import type { InsightModel } from '../../generated/prisma/models/Insight.js';
import { addDays, firstDayOfMonth, lastDayOfMonth, toDbDate, trailingMonths, type LocalDate } from '../../lib/dates.js';
import { Decimal } from '../../lib/money.js';
import type { AppPrismaClient } from '../../lib/prisma.js';
import { prisma } from '../../lib/prisma.js';
import type { CategoryStatsInput } from './insights.stats.js';

/** Either the shared client or a transaction handle — every method accepts both. */
type Db = AppPrismaClient;

/** Fields {@link insightsRepository.setCompleted} writes once generation succeeds. */
export interface CompleteInsightData {
  summaryText: string;
  tipText: string;
  flaggedPatterns: InsightFlaggedPattern[];
  /** Raw input numbers, kept only for debugging/reproduction — never read back structurally. */
  statsSnapshot: unknown;
  generator: 'llm' | 'template';
  model: string | null;
  promptVersion: string | null;
}

export const insightsRepository = {
  /** Count of non-deleted transactions (any type) for `userId` in `month` — the §5.9 eligibility gate. */
  async countTransactionsInMonth(userId: string, month: LocalDate, db: Db = prisma): Promise<number> {
    return db.transaction.count({
      where: { userId, deletedAt: null, txnDate: { gte: toDbDate(month), lte: toDbDate(lastDayOfMonth(month)) } },
    });
  },

  /**
   * Users eligible for `month`'s insight: `status='active'` AND >= {@link INSIGHT_MIN_TRANSACTIONS}
   * non-deleted transactions (any type) that month. Two queries (candidate counts, then an active-
   * status intersection) rather than one `having`-filtered `groupBy` — Prisma's `having` on
   * `_count._all` is finicky across versions, so the count threshold is applied in JS instead.
   */
  async eligibleUserIds(month: LocalDate, db: Db = prisma): Promise<string[]> {
    const rows = await db.transaction.groupBy({
      by: ['userId'],
      where: { deletedAt: null, txnDate: { gte: toDbDate(month), lte: toDbDate(lastDayOfMonth(month)) } },
      _count: { _all: true },
    });
    const candidateIds = rows.filter((row) => row._count._all >= INSIGHT_MIN_TRANSACTIONS).map((row) => row.userId);
    if (candidateIds.length === 0) return [];

    const activeUsers = await db.user.findMany({ where: { id: { in: candidateIds }, status: UserStatus.active }, select: { id: true } });
    return activeUsers.map((u) => u.id);
  },

  /** SUM of income and SUM of expense (non-deleted) for `userId`+`month`, in one grouped query. */
  async totalsForMonth(userId: string, month: LocalDate, db: Db = prisma): Promise<{ income: Decimal; expense: Decimal }> {
    const rows = await db.transaction.groupBy({
      by: ['type'],
      where: { userId, deletedAt: null, txnDate: { gte: toDbDate(month), lte: toDbDate(lastDayOfMonth(month)) } },
      _sum: { amount: true },
    });
    const income = rows.find((row) => row.type === TransactionType.INCOME)?._sum.amount ?? new Decimal(0);
    const expense = rows.find((row) => row.type === TransactionType.EXPENSE)?._sum.amount ?? new Decimal(0);
    return { income, expense };
  },

  /**
   * Per-expense-category stats for `userId`+`month`: this month's total, the 3 trailing months'
   * totals (`null` when that category+month had zero ROWS, not zero amount — `_count` alongside
   * `_sum` distinguishes the two), category name, and any matching budget. Only categories with
   * `cur > 0` this month are included (documented simplification — see `InsightStatsInput`'s own
   * doc comment in `insights.stats.ts`): a budget with 0 spend this month can never be exceeded, so
   * a spendless-but-budgeted category contributes nothing to any of the 3 flag kinds either way.
   */
  async expenseCategoryStats(userId: string, month: LocalDate, db: Db = prisma): Promise<CategoryStatsInput[]> {
    const curRows = await db.transaction.groupBy({
      by: ['categoryId'],
      where: { userId, type: TransactionType.EXPENSE, deletedAt: null, txnDate: { gte: toDbDate(month), lte: toDbDate(lastDayOfMonth(month)) } },
      _sum: { amount: true },
    });
    const curByCategory = new Map(curRows.map((row) => [row.categoryId, row._sum.amount ?? new Decimal(0)]));
    const categoryIds = [...curByCategory.keys()].filter((id) => (curByCategory.get(id) ?? new Decimal(0)).greaterThan(0));
    if (categoryIds.length === 0) return [];

    // The 3 months strictly before `month`, oldest first: [M-3, M-2, M-1].
    const priorMonths = trailingMonths(firstDayOfMonth(addDays(month, -1)), 3);

    const priorRowsByMonth = await Promise.all(
      priorMonths.map((m) =>
        db.transaction.groupBy({
          by: ['categoryId'],
          where: { userId, type: TransactionType.EXPENSE, categoryId: { in: categoryIds }, deletedAt: null, txnDate: { gte: toDbDate(m), lte: toDbDate(lastDayOfMonth(m)) } },
          _sum: { amount: true },
          _count: { _all: true },
        }),
      ),
    );

    const [categories, budgets] = await Promise.all([
      db.category.findMany({ where: { id: { in: categoryIds } }, select: { id: true, name: true } }),
      db.budget.findMany({ where: { userId, month: toDbDate(month), categoryId: { in: categoryIds } }, select: { categoryId: true, limitAmount: true } }),
    ]);
    const nameById = new Map(categories.map((c) => [c.id, c.name]));
    const budgetByCategory = new Map(budgets.map((b) => [b.categoryId, b.limitAmount]));

    return categoryIds.map((categoryId) => {
      const priorMonthValues = priorRowsByMonth.map((rows) => {
        const row = rows.find((r) => r.categoryId === categoryId);
        if (!row || row._count._all === 0) return null;
        return row._sum.amount ?? new Decimal(0);
      });
      return {
        categoryId,
        categoryName: nameById.get(categoryId) ?? '',
        cur: curByCategory.get(categoryId) ?? new Decimal(0),
        // insights.stats.ts expects [M-1, M-2, M-3] oldest-LAST; priorMonthValues here is oldest-first.
        priorMonths: [...priorMonthValues].reverse(),
        budgetLimit: budgetByCategory.get(categoryId) ?? null,
      };
    });
  },

  /** True when `userId` has any non-deleted expense transaction in any of the 3 months before `month`. */
  async hasAnyPriorMonthHistory(userId: string, month: LocalDate, db: Db = prisma): Promise<boolean> {
    const priorMonths = trailingMonths(firstDayOfMonth(addDays(month, -1)), 3);
    const from = priorMonths[0]!;
    const to = lastDayOfMonth(priorMonths[priorMonths.length - 1]!);
    const count = await db.transaction.count({
      where: { userId, type: TransactionType.EXPENSE, deletedAt: null, txnDate: { gte: toDbDate(from), lte: toDbDate(to) } },
    });
    return count > 0;
  },

  /** The single largest non-deleted expense transaction for `userId`+`month`, or `null`. */
  async largestExpenseThisMonth(userId: string, month: LocalDate, db: Db = prisma): Promise<{ categoryName: string; amount: Decimal } | null> {
    const row = await db.transaction.findFirst({
      where: { userId, type: TransactionType.EXPENSE, deletedAt: null, txnDate: { gte: toDbDate(month), lte: toDbDate(lastDayOfMonth(month)) } },
      orderBy: { amount: 'desc' },
      include: { category: { select: { name: true } } },
    });
    return row ? { categoryName: row.category.name, amount: row.amount } : null;
  },

  /** The one insight row for `userId`+`month`, or `null`. */
  findByUserMonth(userId: string, month: LocalDate, db: Db = prisma): Promise<InsightModel | null> {
    return db.insight.findUnique({ where: { userId_month: { userId, month: toDbDate(month) } } });
  },

  /**
   * Batch fetch of the caller's own insight rows for a set of months (P14 §5.12: bookmark
   * title/excerpt enrichment). Months owned by/never generated for `userId` are simply absent.
   */
  findByUserMonths(userId: string, months: LocalDate[], db: Db = prisma): Promise<InsightModel[]> {
    if (months.length === 0) return Promise.resolve([]);
    return db.insight.findMany({ where: { userId, month: { in: months.map(toDbDate) } } });
  },

  /** Most recent `status='completed'` insight for `userId`, any month, newest month first — used
   * by the dashboard widget (P13+: "latest insight" is not necessarily last calendar month, since
   * generation can fail or simply not have run yet). */
  findLatestCompleted(userId: string, db: Db = prisma): Promise<InsightModel | null> {
    return db.insight.findFirst({ where: { userId, status: InsightStatus.completed }, orderBy: { month: 'desc' } });
  },

  /** Creates a `queued` row for `userId`+`month` if absent; returns the existing row unchanged otherwise. */
  upsertQueued(userId: string, month: LocalDate, db: Db = prisma): Promise<InsightModel> {
    return db.insight.upsert({
      where: { userId_month: { userId, month: toDbDate(month) } },
      // `generator` has no DB default (NOT NULL, no @default) — `template` is a harmless
      // placeholder here, always overwritten by `setCompleted` once generation actually finishes.
      create: { userId, month: toDbDate(month), status: InsightStatus.queued, generator: InsightGenerator.template },
      update: {},
    });
  },

  /** Marks a row `processing` (generation has started). */
  setProcessing(id: number, db: Db = prisma): Promise<InsightModel> {
    return db.insight.update({ where: { id }, data: { status: InsightStatus.processing } });
  },

  /** Marks a row `completed` with its generated text/patterns/snapshot. */
  setCompleted(id: number, data: CompleteInsightData, db: Db = prisma): Promise<InsightModel> {
    return db.insight.update({
      where: { id },
      data: {
        summaryText: data.summaryText,
        tipText: data.tipText,
        flaggedPatterns: data.flaggedPatterns as unknown as Prisma.InputJsonValue,
        statsSnapshot: data.statsSnapshot as Prisma.InputJsonValue,
        generator: data.generator,
        model: data.model,
        promptVersion: data.promptVersion,
        status: InsightStatus.completed,
        generatedAt: new Date(),
      },
    });
  },

  /** Marks a row `failed` (generation errored) — never throws itself, best-effort. */
  async setFailed(id: number, db: Db = prisma): Promise<void> {
    await db.insight.update({ where: { id }, data: { status: InsightStatus.failed } });
  },

  /** Paginated insight history for `userId`, newest month first. */
  async list(userId: string, skip: number, take: number, db: Db = prisma): Promise<[InsightModel[], number]> {
    return Promise.all([
      db.insight.findMany({ where: { userId }, orderBy: { month: 'desc' }, skip, take }),
      db.insight.count({ where: { userId } }),
    ]);
  },

  /**
   * Atomically claims a regenerate slot: only matches a row that is under the regenerate cap AND
   * not already `queued`/`processing` (avoids the check-then-increment race two concurrent
   * requests could otherwise exploit). Caller re-reads the row to get the new `regenerateCount`.
   */
  regenerateAtomic(userId: string, month: LocalDate, maxRegenerate: number, db: Db = prisma): Promise<{ count: number }> {
    return db.insight.updateMany({
      where: { userId, month: toDbDate(month), regenerateCount: { lt: maxRegenerate }, status: { notIn: [InsightStatus.queued, InsightStatus.processing] } },
      data: { regenerateCount: { increment: 1 }, status: InsightStatus.queued },
    });
  },
};
