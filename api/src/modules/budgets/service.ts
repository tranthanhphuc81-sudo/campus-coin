import { Prisma } from "@prisma/client";

import { notFound, validationFailed } from "../../lib/problem.js";
import {
  deleteBudgetById,
  ensureOwnedExpenseCategories,
  findBudgetById,
  listBudgetsByExactMonth,
  listBudgetsForUserMonth,
  listExpenseCategoriesForUser,
  sumExpenseByCategoryInMonth,
  upsertBudgetsForMonth,
} from "./repository.js";
import type {
  BudgetDto,
  BudgetLevel,
  CopyPreviousBudgetsInput,
  UpsertBudgetsInput,
} from "./types.js";

function parseMonthInput(month: string): Date {
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

function formatMonth(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function formatAmount(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

function resolveLevel(percent: number, threshold: number): BudgetLevel {
  if (percent >= 100) {
    return "exceeded";
  }

  if (percent >= threshold) {
    return "near";
  }

  return "ok";
}

function nextMonth(monthStart: Date): Date {
  return new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));
}

async function buildBudgetRows(params: { userId: string; monthStart: Date }): Promise<BudgetDto[]> {
  const [expenseCategories, budgets, spentByCategory] = await Promise.all([
    listExpenseCategoriesForUser(params.userId),
    listBudgetsForUserMonth({ userId: params.userId, month: params.monthStart }),
    sumExpenseByCategoryInMonth({
      userId: params.userId,
      monthStart: params.monthStart,
      monthEndExclusive: nextMonth(params.monthStart),
    }),
  ]);

  const budgetsByCategory = new Map(budgets.map((budget) => [budget.categoryId, budget]));
  const spentByCategoryMap = new Map(
    spentByCategory.map((entry) => [entry.categoryId, entry._sum.amount ?? new Prisma.Decimal(0)]),
  );

  return expenseCategories.map((category) => {
    const budget = budgetsByCategory.get(category.id);
    const spent = spentByCategoryMap.get(category.id) ?? new Prisma.Decimal(0);
    const limitAmount = budget?.limitAmount ?? new Prisma.Decimal(0);
    const threshold = budget?.alertThresholdPct ?? 80;

    const percent = limitAmount.gt(0)
      ? Number(
          spent
            .div(limitAmount)
            .mul(100)
            .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
            .toString(),
        )
      : 0;

    return {
      id: budget?.id ?? 0,
      categoryId: category.id,
      categoryName: category.name,
      month: formatMonth(params.monthStart),
      limitAmount: formatAmount(limitAmount),
      alertThresholdPct: threshold,
      spent: formatAmount(spent),
      percent,
      level: resolveLevel(percent, threshold),
    };
  });
}

export async function getBudgetsForMonth(userId: string, month: string): Promise<BudgetDto[]> {
  const monthStart = parseMonthInput(month);
  return buildBudgetRows({ userId, monthStart });
}

export async function upsertBudgets(
  userId: string,
  payload: UpsertBudgetsInput,
): Promise<BudgetDto[]> {
  const monthStart = parseMonthInput(payload.month);
  const uniqueCategoryIds = [...new Set(payload.items.map((item) => item.categoryId))];

  const ownedCount = await ensureOwnedExpenseCategories({
    userId,
    categoryIds: uniqueCategoryIds,
  });

  if (ownedCount !== uniqueCategoryIds.length) {
    throw notFound("Category was not found.");
  }

  await upsertBudgetsForMonth({
    userId,
    month: monthStart,
    items: payload.items.map((item) => {
      const limit = new Prisma.Decimal(item.limitAmount);
      if (!limit.gt(0)) {
        throw validationFailed([
          {
            field: "limitAmount",
            message: "limitAmount must be greater than zero.",
          },
        ]);
      }

      return {
        categoryId: item.categoryId,
        limitAmount: limit,
        alertThresholdPct: item.alertThresholdPct ?? 80,
      };
    }),
  });

  return buildBudgetRows({ userId, monthStart });
}

export async function copyPreviousMonthBudgets(
  userId: string,
  payload: CopyPreviousBudgetsInput,
): Promise<{ copied: number; data: BudgetDto[] }> {
  const targetMonth = parseMonthInput(payload.month);
  const previousMonth = new Date(
    Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth() - 1, 1),
  );

  const previousBudgets = await listBudgetsByExactMonth({
    userId,
    month: previousMonth,
  });

  if (previousBudgets.length > 0) {
    await upsertBudgetsForMonth({
      userId,
      month: targetMonth,
      items: previousBudgets.map((budget) => ({
        categoryId: budget.categoryId,
        limitAmount: budget.limitAmount,
        alertThresholdPct: budget.alertThresholdPct,
      })),
    });
  }

  return {
    copied: previousBudgets.length,
    data: await buildBudgetRows({ userId, monthStart: targetMonth }),
  };
}

export async function removeBudget(
  userId: string,
  budgetId: number,
): Promise<{ deleted: boolean }> {
  const existing = await findBudgetById({
    id: budgetId,
    userId,
  });

  if (!existing) {
    throw notFound("Budget was not found.");
  }

  await deleteBudgetById({
    id: budgetId,
    userId,
  });

  return { deleted: true };
}
