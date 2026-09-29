/**
 * tips.repository.ts
 * Prisma access backing the savings-tips engine (docs/spec/05b §5.10). Self-contained like
 * `dashboard.repository.ts`/`reports.repository.ts`: every aggregate is its own `groupBy`/
 * `aggregate` query, this module never imports another module's repository/service. Every query
 * filters `deletedAt: null` on transactions and scopes by `userId`.
 * Main exports: tipsRepository, UserTipWithRule
 * Spec: docs/spec/05b §5.10 (Bảng 23) · docs/spec/06 §6.3.6 (Bảng 35/36) · docs/spec/05c §5.12 (bookmarks)
 */
import {
  TIP_SMALL_TXN_ALLOWANCE_PCT,
  TIP_SMALL_TXN_WINDOW_DAYS,
  TIP_SUBSCRIPTIONS_CATEGORY_NAME,
  TIP_WEEKEND_LOOKBACK_WEEKS,
  TransactionType,
  type TipRuleType,
  type UserTipStatus,
} from '@campuscoin/shared';
import type { CategoryModel } from '../../generated/prisma/models/Category.js';
import type { TipTemplateModel } from '../../generated/prisma/models/TipTemplate.js';
import type { UserTipModel } from '../../generated/prisma/models/UserTip.js';
import { addDays, daysInMonth, fromDbDate, isoWeekday, lastDayOfMonth, toDbDate, trailingMonths, type LocalDate } from '../../lib/dates.js';
import { average, Decimal } from '../../lib/money.js';
import type { AppPrismaClient } from '../../lib/prisma.js';
import { prisma } from '../../lib/prisma.js';
import type { AverageCategoryStat, BudgetedCategoryStat, SmallTxnCategoryStat, SubscriptionStat, WeekendStat } from './tips.types.js';

/** Either the shared client or a transaction handle — every method accepts both. */
type Db = AppPrismaClient;

/** Number of trailing months averaged into avg3(c)/history-available (Bảng 23 uses "3 tháng gần nhất"
 * throughout; not promoted to shared/constants.ts because only this module needs it). */
const AVG_MONTHS = 3;

/** A `UserTip` row joined with its template's `ruleType` — needed by every DTO-facing read. */
export type UserTipWithRule = UserTipModel & { template: { ruleType: TipRuleType } };

/** Day-of-month of `today` and the month's total day count, used by every `projected(c)` calc. */
function projectionBasis(month: LocalDate, today: LocalDate): { daysElapsed: number; totalDays: number } {
  const year = Number(month.slice(0, 4));
  const monthNum = Number(month.slice(5, 7));
  return { daysElapsed: Number(today.slice(8, 10)), totalDays: daysInMonth(year, monthNum) };
}

/** `projected(c) = spentToDate(c) / daysElapsed x daysInMonth(month)` (§5.10). */
function project(amountToDate: Decimal, daysElapsed: number, totalDays: number): Decimal {
  if (daysElapsed <= 0) return new Decimal(0);
  return amountToDate.dividedBy(daysElapsed).times(totalDays);
}

/** Pinned first, then score descending — shared by `currentPeriodForUser` and `topRanked`. */
function sortRanked<T extends { status: UserTipStatus; score: Decimal }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'pinned' ? -1 : 1;
    return b.score.comparedTo(a.score);
  });
}

export const tipsRepository = {
  /**
   * R1 input: every budgeted expense category this month, with `projected(c)` computed from
   * non-deleted expense spend up to (and including) `today`.
   */
  async budgetedCategoryProjections(userId: string, month: LocalDate, today: LocalDate, db: Db = prisma): Promise<BudgetedCategoryStat[]> {
    const budgets = await db.budget.findMany({ where: { userId, month: toDbDate(month) }, include: { category: true } });
    if (budgets.length === 0) return [];

    const categoryIds = budgets.map((b) => b.categoryId);
    const spentRows = await db.transaction.groupBy({
      by: ['categoryId'],
      where: { userId, type: TransactionType.EXPENSE, deletedAt: null, categoryId: { in: categoryIds }, txnDate: { gte: toDbDate(month), lte: toDbDate(today) } },
      _sum: { amount: true },
    });
    const spentByCategory = new Map(spentRows.map((r) => [r.categoryId, r._sum.amount ?? new Decimal(0)]));
    const { daysElapsed, totalDays } = projectionBasis(month, today);

    return budgets.map((b) => ({
      categoryId: b.categoryId,
      categoryName: b.category.name,
      projected: project(spentByCategory.get(b.categoryId) ?? new Decimal(0), daysElapsed, totalDays),
      limit: b.limitAmount,
    }));
  },

  /**
   * R2 input: every expense category with spend this month, with `projected(c)` and `avg3(c)`
   * (average of whichever of the 3 trailing months have any data; `null` if none do).
   */
  async categoryProjectionsWithAvg3(userId: string, month: LocalDate, today: LocalDate, db: Db = prisma): Promise<AverageCategoryStat[]> {
    const currentRows = await db.transaction.groupBy({
      by: ['categoryId'],
      where: { userId, type: TransactionType.EXPENSE, deletedAt: null, txnDate: { gte: toDbDate(month), lte: toDbDate(today) } },
      _sum: { amount: true },
    });
    if (currentRows.length === 0) return [];

    const categoryIds = currentRows.map((r) => r.categoryId);
    const [categories, monthSumMaps] = await Promise.all([
      db.category.findMany({ where: { id: { in: categoryIds } } }),
      Promise.all(
        trailingMonths(addDays(month, -1), AVG_MONTHS).map(async (m) => {
          const rows = await db.transaction.groupBy({
            by: ['categoryId'],
            where: { userId, type: TransactionType.EXPENSE, deletedAt: null, categoryId: { in: categoryIds }, txnDate: { gte: toDbDate(m), lte: toDbDate(lastDayOfMonth(m)) } },
            _sum: { amount: true },
          });
          return new Map(rows.map((r) => [r.categoryId, r._sum.amount ?? new Decimal(0)]));
        }),
      ),
    ]);
    const nameById = new Map(categories.map((c) => [c.id, c.name]));
    const { daysElapsed, totalDays } = projectionBasis(month, today);

    return currentRows.map((row) => {
      const values = monthSumMaps.map((m) => m.get(row.categoryId)).filter((v): v is Decimal => v !== undefined);
      return {
        categoryId: row.categoryId,
        categoryName: nameById.get(row.categoryId) ?? '',
        projected: project(row._sum.amount ?? new Decimal(0), daysElapsed, totalDays),
        avg3: values.length > 0 ? average(values) : null,
      };
    });
  },

  /**
   * R3 input: per-category count/sum of transactions in the trailing `TIP_SMALL_TXN_WINDOW_DAYS`
   * whose amount is below `allowanceBaseline x TIP_SMALL_TXN_ALLOWANCE_PCT / 100`. Caller must
   * skip calling this (and R3) entirely when the user has no `monthlyAllowanceBaseline`.
   */
  async smallFrequentByCategory(userId: string, allowanceBaseline: Decimal, today: LocalDate, db: Db = prisma): Promise<SmallTxnCategoryStat[]> {
    const windowStart = addDays(today, -(TIP_SMALL_TXN_WINDOW_DAYS - 1));
    const threshold = allowanceBaseline.times(TIP_SMALL_TXN_ALLOWANCE_PCT).dividedBy(100);
    const rows = await db.transaction.groupBy({
      by: ['categoryId'],
      where: { userId, type: TransactionType.EXPENSE, deletedAt: null, txnDate: { gte: toDbDate(windowStart), lte: toDbDate(today) }, amount: { lt: threshold } },
      _sum: { amount: true },
      _count: { _all: true },
    });
    if (rows.length === 0) return [];

    const categories = await db.category.findMany({ where: { id: { in: rows.map((r) => r.categoryId) } } });
    const nameById = new Map(categories.map((c) => [c.id, c.name]));
    return rows.map((r) => ({
      categoryId: r.categoryId,
      categoryName: nameById.get(r.categoryId) ?? '',
      smallTxnCount: r._count._all,
      smallTxnSum: r._sum.amount ?? new Decimal(0),
    }));
  },

  /**
   * R4 input: active expense recurring rules whose category name matches
   * `TIP_SUBSCRIPTIONS_CATEGORY_NAME` case-insensitively (compared in JS — the MySQL provider has
   * no `mode: 'insensitive'` filter, mirroring `imports.service.ts`'s own category-name matching).
   */
  async activeSubscriptions(userId: string, db: Db = prisma): Promise<SubscriptionStat[]> {
    const rows = await db.recurringRule.findMany({
      where: { userId, isActive: true, type: TransactionType.EXPENSE },
      select: { amount: true, category: { select: { name: true } } },
    });
    const target = TIP_SUBSCRIPTIONS_CATEGORY_NAME.toLowerCase();
    return rows.filter((r) => r.category.name.toLowerCase() === target).map((r) => ({ amount: r.amount }));
  },

  /**
   * R5 input: income-to-date and `projected(totalExpense)` for the month. Caller supplies
   * `allowanceBaseline`/`savingsGoal` from the `User` row and `topOverspendCategory` from R2's
   * already-computed stats — this call only needs the two SQL-derived totals.
   */
  async savingsGapTotals(userId: string, month: LocalDate, today: LocalDate, db: Db = prisma): Promise<{ incomeToDate: Decimal; projectedTotalExpense: Decimal }> {
    const rows = await db.transaction.groupBy({
      by: ['type'],
      where: { userId, deletedAt: null, txnDate: { gte: toDbDate(month), lte: toDbDate(today) } },
      _sum: { amount: true },
    });
    const incomeToDate = rows.find((r) => r.type === TransactionType.INCOME)?._sum.amount ?? new Decimal(0);
    const expenseToDate = rows.find((r) => r.type === TransactionType.EXPENSE)?._sum.amount ?? new Decimal(0);
    const { daysElapsed, totalDays } = projectionBasis(month, today);
    return { incomeToDate, projectedTotalExpense: project(expenseToDate, daysElapsed, totalDays) };
  },

  /**
   * R6 input: the most recent Sat-Sun on/before `today`, the same week's Mon-Fri total (for
   * `{percent}` only) and the average weekday spend over the 4 trailing FULL weeks (strictly
   * before that weekend's own Monday).
   */
  async weekendStats(userId: string, today: LocalDate, db: Db = prisma): Promise<WeekendStat> {
    const wd = isoWeekday(today); // 1 (Mon) .. 7 (Sun)
    const daysSinceSaturday = wd === 6 ? 0 : wd === 7 ? 1 : wd + 1;
    const saturday = addDays(today, -daysSinceSaturday);
    const sunday = addDays(saturday, 1);
    const weekMonday = addDays(saturday, -5);
    const baselineStart = addDays(weekMonday, -TIP_WEEKEND_LOOKBACK_WEEKS * 7);
    const baselineEnd = addDays(weekMonday, -1);

    const [weekendAgg, weekWeekdayAgg, baselineRows] = await Promise.all([
      db.transaction.aggregate({
        where: { userId, type: TransactionType.EXPENSE, deletedAt: null, txnDate: { gte: toDbDate(saturday), lte: toDbDate(sunday) } },
        _sum: { amount: true },
      }),
      db.transaction.aggregate({
        where: { userId, type: TransactionType.EXPENSE, deletedAt: null, txnDate: { gte: toDbDate(weekMonday), lte: toDbDate(addDays(weekMonday, 4)) } },
        _sum: { amount: true },
      }),
      db.transaction.groupBy({
        by: ['txnDate'],
        where: { userId, type: TransactionType.EXPENSE, deletedAt: null, txnDate: { gte: toDbDate(baselineStart), lte: toDbDate(baselineEnd) } },
        _sum: { amount: true },
      }),
    ]);

    let baselineWeekdayTotal = new Decimal(0);
    for (const row of baselineRows) {
      if (isoWeekday(fromDbDate(row.txnDate)) <= 5) baselineWeekdayTotal = baselineWeekdayTotal.plus(row._sum.amount ?? new Decimal(0));
    }

    return {
      weekendTotal: weekendAgg._sum.amount ?? new Decimal(0),
      avgWeekdaySpend: baselineWeekdayTotal.dividedBy(TIP_WEEKEND_LOOKBACK_WEEKS * 5),
      weekWeekdayTotal: weekWeekdayAgg._sum.amount ?? new Decimal(0),
    };
  },

  /** Count (0-3) of the 3 trailing months (before `month`) with any non-deleted transaction at all. */
  async monthsOfHistoryAvailable(userId: string, month: LocalDate, db: Db = prisma): Promise<number> {
    const months = trailingMonths(addDays(month, -1), AVG_MONTHS);
    const flags = await Promise.all(
      months.map((m) => db.transaction.count({ where: { userId, deletedAt: null, txnDate: { gte: toDbDate(m), lte: toDbDate(lastDayOfMonth(m)) } } })),
    );
    return flags.filter((count) => count > 0).length;
  },

  /** Every active system/admin tip template (all locales/rule types — caller filters by rule type). */
  activeTemplates(db: Db = prisma): Promise<TipTemplateModel[]> {
    return db.tipTemplate.findMany({ where: { isActive: true } });
  },

  /**
   * A `(userId, templateId, categoryId, period)` row if one already exists this refresh cycle —
   * used to reuse its `createdAt` for `recencyFor` before upserting (part 4/5's design). A plain
   * filter (not the compound unique key), so it works for `categoryId: null` too.
   */
  findExistingForPeriod(userId: string, templateId: number, categoryId: number | null, period: LocalDate, db: Db = prisma): Promise<UserTipModel | null> {
    return db.userTip.findFirst({ where: { userId, templateId, categoryId, period: toDbDate(period) } });
  },

  /**
   * Upserts a rendered tip. **Never overwrites `status`/`dismissedUntil` on an existing row** — an
   * architect-review High finding: those columns must stay under `dismiss`/`pin` control, not be
   * reset back to `active` just because the rule re-fired this refresh.
   *
   * `categoryId: null` candidates (R0/R4/R6) cannot use Prisma's compound-unique `upsert`: the
   * generated `userId_templateId_categoryId_period` key type requires a non-null `categoryId`
   * (Prisma cannot express "NULL means match" for a compound unique index), and MySQL itself
   * treats multiple NULLs in a unique index as distinct rows anyway — so a `categoryId: null`
   * upsert falls back to `findFirst` + `create`/`update` instead of relying on the DB constraint.
   */
  async upsertRendered(
    userId: string,
    templateId: number,
    categoryId: number | null,
    period: LocalDate,
    renderedTitle: string,
    renderedBody: string,
    impactAmount: Decimal,
    score: Decimal,
    db: Db = prisma,
  ): Promise<UserTipModel> {
    if (categoryId === null) {
      const existing = await db.userTip.findFirst({ where: { userId, templateId, categoryId: null, period: toDbDate(period) } });
      if (existing) return db.userTip.update({ where: { id: existing.id }, data: { renderedTitle, renderedBody, impactAmount, score } });
      return db.userTip.create({ data: { userId, templateId, categoryId: null, period: toDbDate(period), renderedTitle, renderedBody, impactAmount, score, status: 'active' } });
    }
    return db.userTip.upsert({
      where: { userId_templateId_categoryId_period: { userId, templateId, categoryId, period: toDbDate(period) } },
      create: { userId, templateId, categoryId, period: toDbDate(period), renderedTitle, renderedBody, impactAmount, score, status: 'active' },
      update: { renderedTitle, renderedBody, impactAmount, score },
    });
  },

  /**
   * Whether a `(ruleType, categoryId)` combo is still within its 30-day dismiss window — keyed on
   * the RULE + category, not on `(templateId, categoryId, period)` (an architect-review High
   * finding): several templates share one `ruleType`, so a tip dismissed under one template's
   * wording must still suppress the same rule+category under a different template too.
   */
  async isDismissedForRuleCategory(userId: string, ruleType: TipRuleType, categoryId: number | null, today: LocalDate, db: Db = prisma): Promise<boolean> {
    const row = await db.userTip.findFirst({
      where: { userId, categoryId, status: 'dismissed', dismissedUntil: { gt: toDbDate(today) }, template: { ruleType } },
    });
    return row !== null;
  },

  /** Flips every expired dismissal of `userId` back to `active` — run once per refresh before ranking. */
  async reactivateExpiredDismissals(userId: string, today: LocalDate, db: Db = prisma): Promise<void> {
    await db.userTip.updateMany({ where: { userId, status: 'dismissed', dismissedUntil: { lte: toDbDate(today) } }, data: { status: 'active', dismissedUntil: null } });
  },

  /**
   * Deletes this period's `active` (never `pinned`/`dismissed`) rows not in `keepIds` — an
   * architect-review Medium finding: a rule that stops firing must not leave a stale tip forever.
   */
  async deleteStaleActive(userId: string, period: LocalDate, keepIds: bigint[], db: Db = prisma): Promise<void> {
    await db.userTip.deleteMany({ where: { userId, period: toDbDate(period), status: 'active', id: { notIn: keepIds } } });
  },

  /** `GET /tips`: current-period `active`/`pinned` rows, pinned first then score descending. */
  async currentPeriodForUser(userId: string, period: LocalDate, db: Db = prisma): Promise<UserTipWithRule[]> {
    const rows = await db.userTip.findMany({
      where: { userId, period: toDbDate(period), status: { in: ['active', 'pinned'] } },
      include: { template: { select: { ruleType: true } } },
    });
    return sortRanked(rows);
  },

  /** Top `limit` ranked tips for `userId`+`period` (pinned first, then score descending) — reused by the dashboard "top tips" widget. */
  async topRanked(userId: string, period: LocalDate, limit: number, db: Db = prisma): Promise<UserTipWithRule[]> {
    const rows = await tipsRepository.currentPeriodForUser(userId, period, db);
    return rows.slice(0, limit);
  },

  /** A tip owned by `userId` — null for another user's row (gives the 404), per CLAUDE.md. */
  findOwned(userId: string, id: bigint, db: Db = prisma): Promise<UserTipWithRule | null> {
    return db.userTip.findFirst({ where: { id, userId }, include: { template: { select: { ruleType: true } } } });
  },

  /**
   * Batch fetch of the caller's own tip rows by id (P14 §5.12: bookmark title/excerpt enrichment).
   * IDs owned by another user are simply absent from the result, never a separate error.
   */
  findByIds(userId: string, ids: bigint[], db: Db = prisma): Promise<UserTipModel[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return db.userTip.findMany({ where: { userId, id: { in: ids } } });
  },

  /** Sets `status`/`dismissedUntil` (ownership must already be verified by the caller). */
  setStatus(id: bigint, status: UserTipStatus, dismissedUntil: Date | null, db: Db = prisma): Promise<UserTipWithRule> {
    return db.userTip.update({ where: { id }, data: { status, dismissedUntil }, include: { template: { select: { ruleType: true } } } });
  },

  /** Looks up category display fields (name) for a set of ids — mirrors `dashboard.repository.ts`. */
  async categoriesByIds(ids: number[], db: Db = prisma): Promise<Map<number, CategoryModel>> {
    if (ids.length === 0) return new Map();
    const rows = await db.category.findMany({ where: { id: { in: ids } } });
    return new Map(rows.map((row) => [row.id, row]));
  },
};
