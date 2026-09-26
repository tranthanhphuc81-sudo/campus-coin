import { Prisma } from "@prisma/client";

import type {
  CategoryMonthlyInput,
  CategoryStat,
  ComputeMonthStatsInput,
  MonthStatsSnapshot,
  PromptStatsInput,
} from "./types.js";

const ABS_FLOOR_BY_CURRENCY: Record<string, number> = {
  USD: 5,
  VND: 100000,
  default: 5,
};

const CURRENCY_MINOR_DIGITS: Record<string, number> = {
  USD: 2,
  VND: 0,
  default: 2,
};

type DecimalLike = Prisma.Decimal | string | number;

function toDecimal(value: DecimalLike | null | undefined): Prisma.Decimal {
  if (value instanceof Prisma.Decimal) {
    return value;
  }

  if (value === null || value === undefined) {
    return new Prisma.Decimal(0);
  }

  return new Prisma.Decimal(value);
}

function clampMoneyDigits(currency: string): number {
  return CURRENCY_MINOR_DIGITS[currency.toUpperCase()] ?? CURRENCY_MINOR_DIGITS.default ?? 2;
}

function formatMoney(value: Prisma.Decimal, currency: string): string {
  return value.toFixed(clampMoneyDigits(currency));
}

function absFloor(currency: string): Prisma.Decimal {
  const normalized = currency.toUpperCase();
  const raw = ABS_FLOOR_BY_CURRENCY[normalized] ?? ABS_FLOOR_BY_CURRENCY.default ?? 5;
  return new Prisma.Decimal(raw);
}

function calculateAvg3(history: CategoryMonthlyInput["history"]): {
  avg3: Prisma.Decimal | null;
  monthsInAvg3: number;
  monthsConsidered: string[];
} {
  const activeMonths = history.filter((item) => item.hasActivity);
  const monthsInAvg3 = activeMonths.length;

  if (monthsInAvg3 < 2) {
    return {
      avg3: null,
      monthsInAvg3,
      monthsConsidered: activeMonths.map((item) => item.month),
    };
  }

  const total = activeMonths.reduce(
    (acc, item) => acc.add(toDecimal(item.amount)),
    new Prisma.Decimal(0),
  );

  return {
    avg3: total.div(monthsInAvg3),
    monthsInAvg3,
    monthsConsidered: activeMonths.map((item) => item.month),
  };
}

export function computeMonthStats(input: ComputeMonthStatsInput): MonthStatsSnapshot {
  const baselineAllowance = input.baselineAllowance ? toDecimal(input.baselineAllowance) : null;
  const totalIncome = toDecimal(input.totalIncome);
  const totalExpense = toDecimal(input.totalExpense);
  const thresholdFromBaseline = baselineAllowance
    ? baselineAllowance.mul(0.05)
    : new Prisma.Decimal(0);
  const absoluteThreshold = Prisma.Decimal.max(absFloor(input.currency), thresholdFromBaseline);

  const categories: CategoryStat[] = [];
  const monthsConsideredSet = new Set<string>();

  for (const category of input.categories) {
    const cur = toDecimal(category.cur);
    const { avg3, monthsInAvg3, monthsConsidered } = calculateAvg3(category.history);

    for (const month of monthsConsidered) {
      monthsConsideredSet.add(month);
    }

    const isNew = cur.greaterThan(0) && category.history.every((entry) => !entry.hasActivity);
    const overBudget = category.budgetLimit
      ? cur.greaterThan(toDecimal(category.budgetLimit))
      : false;

    if (!avg3) {
      categories.push({
        categoryId: category.categoryId,
        name: category.name,
        cur: formatMoney(cur, input.currency),
        avg3: null,
        monthsInAvg3,
        g: null,
        absDiff: null,
        overBudget,
        flagged: false,
        isNew,
      });
      continue;
    }

    const gDecimal = cur.sub(avg3).div(avg3);
    const absDiff = cur.sub(avg3).abs();
    const flagged =
      gDecimal.greaterThanOrEqualTo(0.25) && absDiff.greaterThanOrEqualTo(absoluteThreshold);

    categories.push({
      categoryId: category.categoryId,
      name: category.name,
      cur: formatMoney(cur, input.currency),
      avg3: formatMoney(avg3, input.currency),
      monthsInAvg3,
      g: Number(gDecimal.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP).toString()),
      absDiff: formatMoney(absDiff, input.currency),
      overBudget,
      flagged,
      isNew,
    });
  }

  const topPatterns = [...categories]
    .filter((item) => item.flagged && item.absDiff !== null)
    .sort((a, b) => toDecimal(b.absDiff).cmp(toDecimal(a.absDiff)))
    .slice(0, 3);

  const newCategories = categories
    .filter((item) => item.isNew)
    .map((item) => ({ categoryId: item.categoryId, name: item.name, cur: item.cur }));

  const savingsRate = totalIncome.eq(0)
    ? null
    : Number(
        totalIncome
          .sub(totalExpense)
          .div(totalIncome)
          .toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP)
          .toString(),
      );

  const primaryPattern = topPatterns[0];
  const weeklyCapSuggestion =
    primaryPattern && primaryPattern.avg3
      ? {
          categoryId: primaryPattern.categoryId,
          categoryName: primaryPattern.name,
          amount: formatMoney(toDecimal(primaryPattern.avg3).div(4.33), input.currency),
        }
      : null;

  return {
    userId: input.userId,
    month: input.month,
    currency: input.currency,
    baselineAllowance: input.baselineAllowance,
    totalIncome: formatMoney(totalIncome, input.currency),
    totalExpense: formatMoney(totalExpense, input.currency),
    savingsRate,
    categories,
    topPatterns,
    newCategories,
    largestAnomaly: input.largestAnomaly,
    weeklyCapSuggestion,
    monthsConsideredForAvg3: [...monthsConsideredSet].sort(),
  };
}

export function toPromptStatsInput(
  snapshot: MonthStatsSnapshot,
  substitutionTip: Record<string, string>,
): PromptStatsInput {
  return {
    month: snapshot.month,
    currency: snapshot.currency,
    totalIncome: snapshot.totalIncome,
    totalExpense: snapshot.totalExpense,
    savingsRatePct:
      snapshot.savingsRate === null
        ? null
        : Number(
            new Prisma.Decimal(snapshot.savingsRate)
              .mul(100)
              .toDecimalPlaces(1, Prisma.Decimal.ROUND_HALF_UP)
              .toString(),
          ),
    topPatterns: snapshot.topPatterns.map((item) => ({
      category: item.name,
      curAmount: item.cur,
      avg3Amount: item.avg3 ?? "0",
      growthPct:
        item.g === null
          ? 0
          : Number(
              new Prisma.Decimal(item.g)
                .mul(100)
                .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
                .toString(),
            ),
    })),
    newCategories: snapshot.newCategories.map((item) => item.name),
    largestAnomaly: snapshot.largestAnomaly
      ? { category: snapshot.largestAnomaly.categoryName, amount: snapshot.largestAnomaly.amount }
      : null,
    weeklyCapSuggestion: snapshot.weeklyCapSuggestion
      ? {
          category: snapshot.weeklyCapSuggestion.categoryName,
          amount: snapshot.weeklyCapSuggestion.amount,
          substitutionTip:
            substitutionTip[snapshot.weeklyCapSuggestion.categoryName.toLowerCase()] ??
            substitutionTip.default ??
            "Track this category for a week and set a small weekly cap to watch it closely.",
        }
      : null,
  };
}
