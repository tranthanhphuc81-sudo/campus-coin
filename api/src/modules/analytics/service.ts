import { Prisma } from "@prisma/client";

import { validationFailed } from "../../lib/problem.js";
import { prisma } from "../../lib/prisma.js";
import {
  findUserGreetingName,
  queryBudgetVsActual,
  queryCategoryBreakdown,
  queryCategoryTotalAmount,
  queryDailyIncomeExpense,
  queryMonthTotals,
  queryTopExpenseCategory,
  queryTrendByMonths,
  queryWeeklyIncomeExpense,
} from "./repository.js";
import type {
  CategoryBreakdownResponse,
  DailyWeeklyResponse,
  DashboardSummaryResponse,
  DashboardTopCategory,
  DashboardTrendItem,
  IncomeVsExpenseResponse,
  WireTransactionType,
} from "./types.js";

const DEFAULT_TIMEZONE = "Asia/Ho_Chi_Minh";

function toDecimal(
  value: Prisma.Decimal | string | number | bigint | null | undefined,
): Prisma.Decimal {
  if (value instanceof Prisma.Decimal) {
    return value;
  }

  if (typeof value === "bigint") {
    return new Prisma.Decimal(value.toString());
  }

  if (value === null || value === undefined) {
    return new Prisma.Decimal(0);
  }

  return new Prisma.Decimal(value);
}

function toCount(value: number | bigint): number {
  if (typeof value === "bigint") {
    return Number(value);
  }

  return value;
}

function formatMoney(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

function parseMonthStart(month: string): Date {
  const [yearToken, monthToken] = month.split("-");
  const year = Number(yearToken);
  const monthIndex = Number(monthToken) - 1;

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(monthIndex) ||
    monthIndex < 0 ||
    monthIndex > 11
  ) {
    throw validationFailed([
      {
        field: "month",
        message: "month must use YYYY-MM format.",
      },
    ]);
  }

  return new Date(Date.UTC(year, monthIndex, 1));
}

function parseDateOnly(value: string, field: "from" | "to"): Date {
  const date = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    throw validationFailed([
      {
        field,
        message: `${field} must use YYYY-MM-DD format.`,
      },
    ]);
  }

  return date;
}

function addDays(date: Date, delta: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + delta));
}

function addMonths(date: Date, delta: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + delta, 1));
}

function toDateOnlyString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toMonthString(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function resolveTimezone(preferred?: string): string {
  const candidate = preferred?.trim();
  if (!candidate) {
    return DEFAULT_TIMEZONE;
  }

  try {
    Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

function getGreetingForHour(hour: number): string {
  if (hour < 12) {
    return "Good morning";
  }

  if (hour < 18) {
    return "Good afternoon";
  }

  return "Good evening";
}

function nowInfoInTimezone(timezone: string): { localDate: string; hour: number } {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value ?? "1970");
  const month = Number(parts.find((part) => part.type === "month")?.value ?? "1");
  const day = Number(parts.find((part) => part.type === "day")?.value ?? "1");
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");

  const localDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  return {
    localDate,
    hour,
  };
}

function toPercent(numerator: Prisma.Decimal, denominator: Prisma.Decimal): number {
  if (denominator.eq(0)) {
    return 0;
  }

  const value = numerator
    .div(denominator)
    .mul(100)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

  return Number(value.toString());
}

function toDeltaPct(current: Prisma.Decimal, previous: Prisma.Decimal): number | null {
  if (previous.eq(0)) {
    return null;
  }

  const pct = current
    .sub(previous)
    .div(previous.abs())
    .mul(100)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

  return Number(pct.toString());
}

function mapTrendRowsToWire(
  rows: Array<{ month: string; income: unknown; expense: unknown }>,
): DashboardTrendItem[] {
  return rows.map((row) => {
    const income = toDecimal(row.income as Prisma.Decimal | string | number);
    const expense = toDecimal(row.expense as Prisma.Decimal | string | number);
    const net = income.sub(expense);

    return {
      month: row.month,
      income: formatMoney(income),
      expense: formatMoney(expense),
      net: formatMoney(net),
    };
  });
}

function resolveBudgetLevel(percent: number): "ok" | "near" | "exceeded" {
  if (percent >= 100) {
    return "exceeded";
  }

  if (percent >= 80) {
    return "near";
  }

  return "ok";
}

export async function getDashboardSummary(params: {
  userId: string;
  month: string;
  timezone?: string;
}): Promise<DashboardSummaryResponse> {
  const timezone = resolveTimezone(params.timezone);
  const monthStart = parseMonthStart(params.month);
  const monthEndExclusive = addMonths(monthStart, 1);
  const prevMonthStart = addMonths(monthStart, -1);

  const [
    fullName,
    currentTotals,
    previousTotals,
    topCategoryRow,
    budgetRows,
    categoryRows,
    trendRows,
    latestInsight,
  ] = await Promise.all([
    findUserGreetingName(params.userId),
    queryMonthTotals({
      userId: params.userId,
      from: monthStart,
      toExclusive: monthEndExclusive,
    }),
    queryMonthTotals({
      userId: params.userId,
      from: prevMonthStart,
      toExclusive: monthStart,
    }),
    queryTopExpenseCategory({
      userId: params.userId,
      from: monthStart,
      toExclusive: monthEndExclusive,
    }),
    queryBudgetVsActual({
      userId: params.userId,
      monthStart,
      monthEndExclusive,
    }),
    queryCategoryBreakdown({
      userId: params.userId,
      from: monthStart,
      toExclusive: monthEndExclusive,
      type: "expense",
    }),
    queryTrendByMonths({
      userId: params.userId,
      startMonth: addMonths(monthStart, -5),
      months: 6,
    }),
    prisma.insight
      .findFirst({
        where: {
          userId: params.userId,
          status: "COMPLETED",
        },
        orderBy: [{ month: "desc" }, { id: "desc" }],
        select: {
          month: true,
          summaryText: true,
          tipText: true,
          generator: true,
        },
      })
      .catch(() => null),
  ]);

  const income = toDecimal(currentTotals.income);
  const expense = toDecimal(currentTotals.expense);
  const net = income.sub(expense);
  const previousNet = toDecimal(previousTotals.income).sub(toDecimal(previousTotals.expense));

  const totalExpenseForBreakdown = categoryRows.reduce(
    (acc, row) => acc.add(toDecimal(row.amount as Prisma.Decimal | string | number)),
    new Prisma.Decimal(0),
  );

  const topCategory: DashboardTopCategory | null = topCategoryRow
    ? {
        categoryId: topCategoryRow.categoryId,
        categoryName: topCategoryRow.categoryName,
        amount: formatMoney(toDecimal(topCategoryRow.amount as Prisma.Decimal | string | number)),
        sharePct: toPercent(
          toDecimal(topCategoryRow.amount as Prisma.Decimal | string | number),
          totalExpenseForBreakdown,
        ),
        transactionCount: toCount(topCategoryRow.transactionCount),
      }
    : null;

  const budgetVsActual = budgetRows.map((row) => {
    const limitAmount = toDecimal(row.limitAmount as Prisma.Decimal | string | number);
    const spent = toDecimal(row.spent as Prisma.Decimal | string | number);
    const percent = toPercent(spent, limitAmount);

    return {
      budgetId: row.budgetId,
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      limitAmount: formatMoney(limitAmount),
      spent: formatMoney(spent),
      percent,
      level: resolveBudgetLevel(percent),
    };
  });

  const categoryBreakdown = categoryRows.map((row) => {
    const amount = toDecimal(row.amount as Prisma.Decimal | string | number);

    return {
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      amount: formatMoney(amount),
      sharePct: toPercent(amount, totalExpenseForBreakdown),
      transactionCount: toCount(row.transactionCount),
    };
  });

  const nowInfo = nowInfoInTimezone(timezone);

  return {
    greeting: {
      message: `${getGreetingForHour(nowInfo.hour)}, ${fullName}!`,
      timezone,
      localDate: nowInfo.localDate,
    },
    totals: {
      income: formatMoney(income),
      expense: formatMoney(expense),
      net: formatMoney(net),
      vsPrevMonthPct: toDeltaPct(net, previousNet),
    },
    topCategory,
    budgetVsActual,
    categoryBreakdown,
    trend6Months: mapTrendRowsToWire(trendRows),
    savingsGoalProgress: {
      goalAmount: "0.00",
      netAmount: formatMoney(net),
      progressPct: 0,
      status: "not_set",
    },
    latestInsight: latestInsight
      ? {
          month: toMonthString(latestInsight.month),
          summaryText: latestInsight.summaryText,
          tipText: latestInsight.tipText,
          generator: latestInsight.generator === "llm" ? "llm" : "template",
        }
      : null,
    recentActivity: [],
    activeAnnouncements: [],
    tips: [],
  };
}

export async function getCategoryBreakdownReport(params: {
  userId: string;
  from: string;
  to: string;
  type: WireTransactionType;
  categoryId?: number;
}): Promise<CategoryBreakdownResponse> {
  const fromDate = parseDateOnly(params.from, "from");
  const toDate = parseDateOnly(params.to, "to");
  const toExclusive = addDays(toDate, 1);

  const days = Math.floor((toDate.getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  const previousTo = addDays(fromDate, -1);
  const previousFrom = addDays(previousTo, -(days - 1));
  const previousToExclusive = addDays(previousTo, 1);

  const [items, currentTotalRaw, previousTotalRaw] = await Promise.all([
    queryCategoryBreakdown({
      userId: params.userId,
      from: fromDate,
      toExclusive,
      type: params.type,
      categoryId: params.categoryId,
    }),
    queryCategoryTotalAmount({
      userId: params.userId,
      from: fromDate,
      toExclusive,
      type: params.type,
      categoryId: params.categoryId,
    }),
    queryCategoryTotalAmount({
      userId: params.userId,
      from: previousFrom,
      toExclusive: previousToExclusive,
      type: params.type,
      categoryId: params.categoryId,
    }),
  ]);

  const currentTotal = toDecimal(currentTotalRaw as Prisma.Decimal | string | number);
  const previousTotal = toDecimal(previousTotalRaw as Prisma.Decimal | string | number);

  return {
    filters: {
      from: params.from,
      to: params.to,
      type: params.type,
      categoryId: params.categoryId ?? null,
    },
    previousRange: {
      from: toDateOnlyString(previousFrom),
      to: toDateOnlyString(previousTo),
    },
    totalAmount: formatMoney(currentTotal),
    totalTransactions: items.reduce((acc, item) => acc + toCount(item.transactionCount), 0),
    previousTotalAmount: formatMoney(previousTotal),
    deltaAmount: formatMoney(currentTotal.sub(previousTotal)),
    deltaPct: toDeltaPct(currentTotal, previousTotal),
    items: items.map((item) => {
      const amount = toDecimal(item.amount as Prisma.Decimal | string | number);
      return {
        categoryId: item.categoryId,
        categoryName: item.categoryName,
        amount: formatMoney(amount),
        sharePct: toPercent(amount, currentTotal),
        transactionCount: toCount(item.transactionCount),
      };
    }),
  };
}

export async function getIncomeVsExpenseReport(params: {
  userId: string;
  months: number;
}): Promise<IncomeVsExpenseResponse> {
  const now = new Date();
  const thisMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const startMonth = addMonths(thisMonthStart, -(params.months - 1));

  const rows = await queryTrendByMonths({
    userId: params.userId,
    startMonth,
    months: params.months,
  });

  return {
    months: params.months,
    data: mapTrendRowsToWire(rows).map((item) => ({
      month: item.month,
      income: item.income,
      expense: item.expense,
      net: item.net,
    })),
  };
}

export async function getDailyWeeklyReport(params: {
  userId: string;
  month: string;
}): Promise<DailyWeeklyResponse> {
  const monthStart = parseMonthStart(params.month);
  const monthEndExclusive = addMonths(monthStart, 1);

  const [dailyRows, weeklyRows] = await Promise.all([
    queryDailyIncomeExpense({
      userId: params.userId,
      monthStart,
      monthEndExclusive,
    }),
    queryWeeklyIncomeExpense({
      userId: params.userId,
      monthStart,
      monthEndExclusive,
    }),
  ]);

  const daily = dailyRows.map((row) => {
    const income = toDecimal(row.income as Prisma.Decimal | string | number);
    const expense = toDecimal(row.expense as Prisma.Decimal | string | number);

    return {
      date: row.date,
      income: formatMoney(income),
      expense: formatMoney(expense),
      net: formatMoney(income.sub(expense)),
    };
  });

  const weekly = weeklyRows.map((row) => {
    const income = toDecimal(row.income as Prisma.Decimal | string | number);
    const expense = toDecimal(row.expense as Prisma.Decimal | string | number);

    return {
      isoWeek: row.isoWeek,
      weekStartDate: row.weekStartDate,
      income: formatMoney(income),
      expense: formatMoney(expense),
      net: formatMoney(income.sub(expense)),
    };
  });

  const totalExpense = daily.reduce(
    (acc, row) => acc.add(new Prisma.Decimal(row.expense)),
    new Prisma.Decimal(0),
  );

  const averageDailyExpense = daily.length
    ? totalExpense.div(daily.length).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
    : new Prisma.Decimal(0);

  return {
    month: toMonthString(monthStart),
    daily,
    weekly,
    averageDailyExpense: formatMoney(averageDailyExpense),
  };
}
