import { Prisma } from "@prisma/client";

import {
  calculateProjectedAmount,
  decimalToMoney,
  type TipCandidate,
  type TipRuleEvaluationContext,
} from "./types.js";

export function evaluateOverBudgetRule(context: TipRuleEvaluationContext): TipCandidate[] {
  if (context.daysElapsed < 5) {
    return [];
  }

  const candidates: TipCandidate[] = [];

  for (const category of context.categorySpending) {
    if (!category.budgetLimit || category.budgetLimit.lte(0)) {
      continue;
    }

    const projected = calculateProjectedAmount(
      category.spentToDate,
      context.daysElapsed,
      context.daysInMonth,
    );
    if (projected.lte(category.budgetLimit)) {
      continue;
    }

    const impactAmount = projected
      .sub(category.budgetLimit)
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const weeklyCap = category.budgetLimit
      .div(4.33)
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

    candidates.push({
      ruleType: "over_budget",
      categoryId: category.categoryId,
      impactAmount,
      historicalMonths: category.historicalMonths,
      variables: {
        category: category.categoryName,
        projected: decimalToMoney(projected),
        limit: decimalToMoney(category.budgetLimit),
        amount: decimalToMoney(impactAmount),
        weeklyCap: decimalToMoney(weeklyCap),
      },
    });
  }

  return candidates;
}
