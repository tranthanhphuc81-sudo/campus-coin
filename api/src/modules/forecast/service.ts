import { Prisma } from "@prisma/client";

import { computeNextRunDate } from "../../jobs/recurring.js";
import { stddev, weightedForecast } from "../../lib/stats.js";
import {
  listActiveRecurringRules,
  listForecastCategories,
  listMonthlyCategoryAmounts,
} from "./repository.js";
import type { ForecastItem, NextMonthForecastResponse } from "./types.js";

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthStartOf(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addMonths(date: Date, delta: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + delta, 1));
}

function toDecimal(value: Prisma.Decimal | string | number | null | undefined): Prisma.Decimal {
  if (value instanceof Prisma.Decimal) {
    return value;
  }

  if (value === null || value === undefined) {
    return new Prisma.Decimal(0);
  }

  return new Prisma.Decimal(value);
}

function toNumber(value: Prisma.Decimal): number {
  return Number(value.toString());
}

function toAmountString(value: number): string {
  return new Prisma.Decimal(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2);
}

function recurringContributionForMonth(params: {
  rules: Array<{
    categoryId: number;
    amount: Prisma.Decimal;
    frequency: "WEEKLY" | "MONTHLY" | "YEARLY";
    intervalCount: number;
    dayOfMonth: number | null;
    dayOfWeek: number | null;
    startDate: Date;
    endDate: Date | null;
    nextRunDate: Date;
  }>;
  categoryId: number;
  targetMonthStart: Date;
  targetMonthEndExclusive: Date;
}): number {
  const matchingRules = params.rules.filter((rule) => rule.categoryId === params.categoryId);

  let total = new Prisma.Decimal(0);

  for (const rule of matchingRules) {
    let runDate = new Date(rule.nextRunDate);
    let guard = 0;

    while (runDate < params.targetMonthEndExclusive && guard < 96) {
      const eligible =
        runDate >= params.targetMonthStart && (!rule.endDate || runDate <= rule.endDate);
      if (eligible) {
        total = total.add(rule.amount);
      }

      const next = computeNextRunDate(
        {
          frequency: rule.frequency,
          intervalCount: rule.intervalCount,
          dayOfMonth: rule.dayOfMonth,
          dayOfWeek: rule.dayOfWeek,
          startDate: rule.startDate,
        },
        runDate,
      );

      if (next.getTime() <= runDate.getTime()) {
        break;
      }

      runDate = next;
      guard += 1;
    }
  }

  return toNumber(total);
}

export async function getNextMonthForecast(userId: string): Promise<NextMonthForecastResponse> {
  const now = new Date();
  const currentMonthStart = monthStartOf(now);
  const previous2MonthStart = addMonths(currentMonthStart, -2);
  const nextMonthStart = addMonths(currentMonthStart, 1);
  const nextMonthEndExclusive = addMonths(nextMonthStart, 1);

  const [categories, monthlyRows, recurringRules] = await Promise.all([
    listForecastCategories(userId),
    listMonthlyCategoryAmounts({
      userId,
      from: previous2MonthStart,
      toExclusive: nextMonthStart,
    }),
    listActiveRecurringRules(userId),
  ]);

  const monthMinus3 = monthKey(previous2MonthStart);
  const monthMinus2 = monthKey(addMonths(previous2MonthStart, 1));
  const monthMinus1 = monthKey(addMonths(previous2MonthStart, 2));

  const byCategoryMonth = new Map<string, { amount: number; count: number }>();
  for (const row of monthlyRows) {
    const key = `${row.categoryId}:${row.month}`;
    const existing = byCategoryMonth.get(key);
    const amount = toNumber(toDecimal(row.amount));
    const count = typeof row.txnCount === "bigint" ? Number(row.txnCount) : row.txnCount;

    byCategoryMonth.set(key, {
      amount: (existing?.amount ?? 0) + amount,
      count: (existing?.count ?? 0) + count,
    });
  }

  const items: ForecastItem[] = categories.map((category) => {
    const m1 = byCategoryMonth.get(`${category.id}:${monthMinus1}`);
    const m2 = byCategoryMonth.get(`${category.id}:${monthMinus2}`);
    const m3 = byCategoryMonth.get(`${category.id}:${monthMinus3}`);

    const values = [m1?.amount ?? 0, m2?.amount ?? 0, m3?.amount ?? 0];
    const monthsWithData = [m1, m2, m3].filter((entry) => (entry?.count ?? 0) > 0).length;

    const recurring = recurringContributionForMonth({
      rules: recurringRules,
      categoryId: category.id,
      targetMonthStart: nextMonthStart,
      targetMonthEndExclusive: nextMonthEndExclusive,
    });

    if (monthsWithData < 2) {
      return {
        categoryId: category.id,
        categoryName: category.name,
        type: category.type === "INCOME" ? "income" : "expense",
        predictedAmount: toAmountString(recurring),
        lowerBound: toAmountString(Math.max(0, recurring)),
        upperBound: toAmountString(Math.max(0, recurring)),
        insufficientData: true,
      };
    }

    const forecast = weightedForecast(values[0] ?? 0, values[1] ?? 0, values[2] ?? 0) + recurring;
    const sigma = stddev(values);
    const lowerBound = Math.max(0, forecast - sigma);
    const upperBound = Math.max(0, forecast + sigma);

    return {
      categoryId: category.id,
      categoryName: category.name,
      type: category.type === "INCOME" ? "income" : "expense",
      predictedAmount: toAmountString(forecast),
      lowerBound: toAmountString(lowerBound),
      upperBound: toAmountString(upperBound),
      insufficientData: false,
    };
  });

  const hasForecastableItem = items.some((item) => !item.insufficientData);

  return {
    month: monthKey(nextMonthStart),
    insufficientData: !hasForecastableItem,
    items,
  };
}
