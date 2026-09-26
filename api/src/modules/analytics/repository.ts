import { Prisma } from "@prisma/client";

import { prisma } from "../../lib/prisma.js";

type MonthTotalsRow = {
  income: Prisma.Decimal | string | number;
  expense: Prisma.Decimal | string | number;
};

type CategoryAggregateRow = {
  categoryId: number;
  categoryName: string;
  amount: Prisma.Decimal | string | number;
  transactionCount: bigint | number;
};

type BudgetVsActualRow = {
  budgetId: number;
  categoryId: number;
  categoryName: string;
  limitAmount: Prisma.Decimal | string | number;
  spent: Prisma.Decimal | string | number;
};

type TrendRow = {
  month: string;
  income: Prisma.Decimal | string | number;
  expense: Prisma.Decimal | string | number;
};

type DailyRow = {
  date: string;
  income: Prisma.Decimal | string | number;
  expense: Prisma.Decimal | string | number;
};

type WeeklyRow = {
  isoWeek: string;
  weekStartDate: string;
  income: Prisma.Decimal | string | number;
  expense: Prisma.Decimal | string | number;
};

function toUpperTxnType(type: "income" | "expense"): "INCOME" | "EXPENSE" {
  return type === "income" ? "INCOME" : "EXPENSE";
}

export async function findUserGreetingName(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { fullName: true },
  });

  return user?.fullName ?? "there";
}

export async function queryMonthTotals(params: {
  userId: string;
  from: Date;
  toExclusive: Date;
}): Promise<MonthTotalsRow> {
  // Uses idx_transactions_user_date via user_id + txn_date range.
  const rows = await prisma.$queryRaw<MonthTotalsRow[]>`
    SELECT
      COALESCE(SUM(CASE WHEN t.type = 'INCOME' THEN t.amount ELSE 0 END), 0) AS income,
      COALESCE(SUM(CASE WHEN t.type = 'EXPENSE' THEN t.amount ELSE 0 END), 0) AS expense
    FROM transactions t FORCE INDEX (idx_transactions_user_date)
    WHERE t.user_id = ${params.userId}
      AND t.deleted_at IS NULL
      AND t.txn_date >= ${params.from}
      AND t.txn_date < ${params.toExclusive}
  `;

  return rows[0] ?? { income: 0, expense: 0 };
}

export async function queryTopExpenseCategory(params: {
  userId: string;
  from: Date;
  toExclusive: Date;
}): Promise<CategoryAggregateRow | null> {
  // Uses idx_transactions_user_category_date via user_id + category_id + txn_date.
  const rows = await prisma.$queryRaw<CategoryAggregateRow[]>`
    SELECT
      t.category_id AS categoryId,
      c.name AS categoryName,
      COALESCE(SUM(t.amount), 0) AS amount,
      COUNT(*) AS transactionCount
    FROM transactions t FORCE INDEX (idx_transactions_user_category_date)
    INNER JOIN categories c ON c.id = t.category_id
    WHERE t.user_id = ${params.userId}
      AND t.type = 'EXPENSE'
      AND t.deleted_at IS NULL
      AND t.txn_date >= ${params.from}
      AND t.txn_date < ${params.toExclusive}
    GROUP BY t.category_id, c.name
    ORDER BY amount DESC, transactionCount DESC, t.category_id ASC
    LIMIT 1
  `;

  return rows[0] ?? null;
}

export async function queryBudgetVsActual(params: {
  userId: string;
  monthStart: Date;
  monthEndExclusive: Date;
}): Promise<BudgetVsActualRow[]> {
  // Uses uq_budgets_user_category_month + idx_transactions_user_category_date.
  return prisma.$queryRaw<BudgetVsActualRow[]>`
    SELECT
      b.id AS budgetId,
      b.category_id AS categoryId,
      c.name AS categoryName,
      b.limit_amount AS limitAmount,
      COALESCE(SUM(CASE WHEN t.type = 'EXPENSE' THEN t.amount ELSE 0 END), 0) AS spent
    FROM budgets b
    INNER JOIN categories c ON c.id = b.category_id
    LEFT JOIN transactions t FORCE INDEX (idx_transactions_user_category_date)
      ON t.user_id = b.user_id
      AND t.category_id = b.category_id
      AND t.deleted_at IS NULL
      AND t.txn_date >= ${params.monthStart}
      AND t.txn_date < ${params.monthEndExclusive}
    WHERE b.user_id = ${params.userId}
      AND b.month = ${params.monthStart}
    GROUP BY b.id, b.category_id, c.name, b.limit_amount, c.sort_order, c.id
    ORDER BY c.sort_order ASC, c.id ASC
  `;
}

export async function queryCategoryBreakdown(params: {
  userId: string;
  from: Date;
  toExclusive: Date;
  type: "income" | "expense";
  categoryId?: number;
}): Promise<CategoryAggregateRow[]> {
  const categoryFilter =
    params.categoryId === undefined
      ? Prisma.empty
      : Prisma.sql` AND t.category_id = ${params.categoryId}`;

  // Uses idx_transactions_user_category_date via user_id + category_id + txn_date.
  return prisma.$queryRaw<CategoryAggregateRow[]>`
    SELECT
      t.category_id AS categoryId,
      c.name AS categoryName,
      COALESCE(SUM(t.amount), 0) AS amount,
      COUNT(*) AS transactionCount
    FROM transactions t FORCE INDEX (idx_transactions_user_category_date)
    INNER JOIN categories c ON c.id = t.category_id
    WHERE t.user_id = ${params.userId}
      AND t.type = ${toUpperTxnType(params.type)}
      AND t.deleted_at IS NULL
      AND t.txn_date >= ${params.from}
      AND t.txn_date < ${params.toExclusive}
      ${categoryFilter}
    GROUP BY t.category_id, c.name
    ORDER BY amount DESC, t.category_id ASC
  `;
}

export async function queryTrendByMonths(params: {
  userId: string;
  startMonth: Date;
  months: number;
}): Promise<TrendRow[]> {
  // Uses idx_transactions_user_date while joining each generated month window.
  return prisma.$queryRaw<TrendRow[]>`
    WITH RECURSIVE month_series AS (
      SELECT ${params.startMonth} AS month_start, 1 AS seq
      UNION ALL
      SELECT DATE_ADD(month_start, INTERVAL 1 MONTH), seq + 1
      FROM month_series
      WHERE seq < ${params.months}
    )
    SELECT
      DATE_FORMAT(ms.month_start, '%Y-%m') AS month,
      COALESCE(SUM(CASE WHEN t.type = 'INCOME' THEN t.amount ELSE 0 END), 0) AS income,
      COALESCE(SUM(CASE WHEN t.type = 'EXPENSE' THEN t.amount ELSE 0 END), 0) AS expense
    FROM month_series ms
    LEFT JOIN transactions t FORCE INDEX (idx_transactions_user_date)
      ON t.user_id = ${params.userId}
      AND t.deleted_at IS NULL
      AND t.txn_date >= ms.month_start
      AND t.txn_date < DATE_ADD(ms.month_start, INTERVAL 1 MONTH)
    GROUP BY ms.month_start
    ORDER BY ms.month_start ASC
  `;
}

export async function queryCategoryTotalAmount(params: {
  userId: string;
  from: Date;
  toExclusive: Date;
  type: "income" | "expense";
  categoryId?: number;
}): Promise<Prisma.Decimal | string | number> {
  const categoryFilter =
    params.categoryId === undefined
      ? Prisma.empty
      : Prisma.sql` AND t.category_id = ${params.categoryId}`;

  // Uses idx_transactions_user_date via user_id + txn_date; optional category filter applied after range.
  const rows = await prisma.$queryRaw<Array<{ totalAmount: Prisma.Decimal | string | number }>>`
    SELECT COALESCE(SUM(t.amount), 0) AS totalAmount
    FROM transactions t FORCE INDEX (idx_transactions_user_date)
    WHERE t.user_id = ${params.userId}
      AND t.type = ${toUpperTxnType(params.type)}
      AND t.deleted_at IS NULL
      AND t.txn_date >= ${params.from}
      AND t.txn_date < ${params.toExclusive}
      ${categoryFilter}
  `;

  return rows[0]?.totalAmount ?? 0;
}

export async function queryDailyIncomeExpense(params: {
  userId: string;
  monthStart: Date;
  monthEndExclusive: Date;
}): Promise<DailyRow[]> {
  // Uses idx_transactions_user_date with equality join on generated day series.
  return prisma.$queryRaw<DailyRow[]>`
    WITH RECURSIVE day_series AS (
      SELECT ${params.monthStart} AS day_date
      UNION ALL
      SELECT DATE_ADD(day_date, INTERVAL 1 DAY)
      FROM day_series
      WHERE day_date < DATE_SUB(${params.monthEndExclusive}, INTERVAL 1 DAY)
    )
    SELECT
      DATE_FORMAT(ds.day_date, '%Y-%m-%d') AS date,
      COALESCE(SUM(CASE WHEN t.type = 'INCOME' THEN t.amount ELSE 0 END), 0) AS income,
      COALESCE(SUM(CASE WHEN t.type = 'EXPENSE' THEN t.amount ELSE 0 END), 0) AS expense
    FROM day_series ds
    LEFT JOIN transactions t FORCE INDEX (idx_transactions_user_date)
      ON t.user_id = ${params.userId}
      AND t.deleted_at IS NULL
      AND t.txn_date = ds.day_date
    GROUP BY ds.day_date
    ORDER BY ds.day_date ASC
  `;
}

export async function queryWeeklyIncomeExpense(params: {
  userId: string;
  monthStart: Date;
  monthEndExclusive: Date;
}): Promise<WeeklyRow[]> {
  // Uses idx_transactions_user_date with day expansion then ISO-week grouping.
  return prisma.$queryRaw<WeeklyRow[]>`
    WITH RECURSIVE day_series AS (
      SELECT ${params.monthStart} AS day_date
      UNION ALL
      SELECT DATE_ADD(day_date, INTERVAL 1 DAY)
      FROM day_series
      WHERE day_date < DATE_SUB(${params.monthEndExclusive}, INTERVAL 1 DAY)
    )
    SELECT
      CONCAT(DATE_FORMAT(ds.day_date, '%x'), '-W', DATE_FORMAT(ds.day_date, '%v')) AS isoWeek,
      DATE_FORMAT(DATE_SUB(ds.day_date, INTERVAL WEEKDAY(ds.day_date) DAY), '%Y-%m-%d') AS weekStartDate,
      COALESCE(SUM(CASE WHEN t.type = 'INCOME' THEN t.amount ELSE 0 END), 0) AS income,
      COALESCE(SUM(CASE WHEN t.type = 'EXPENSE' THEN t.amount ELSE 0 END), 0) AS expense
    FROM day_series ds
    LEFT JOIN transactions t FORCE INDEX (idx_transactions_user_date)
      ON t.user_id = ${params.userId}
      AND t.deleted_at IS NULL
      AND t.txn_date = ds.day_date
    GROUP BY isoWeek, weekStartDate
    ORDER BY weekStartDate ASC
  `;
}
