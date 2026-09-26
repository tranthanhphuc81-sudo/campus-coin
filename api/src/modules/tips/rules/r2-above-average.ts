import { Prisma } from "@prisma/client";

import {
  calculateProjectedAmount,
  decimalToMoney,
  decimalToPercent,
  type TipCandidate,
  type TipRuleEvaluationContext,
} from "./types.js";

export function evaluateAboveAverageRule(context: TipRuleEvaluationContext): TipCandidate[] {
  if (context.daysElapsed < 5) {
    return [];
  }

  const candidates: TipCandidate[] = [];

  for (const category of context.categorySpending) {
    if (category.avg3.lte(0)) {
      continue;
    }

    const projected = calculateProjectedAmount(
      category.spentToDate,
      context.daysElapsed,
      context.daysInMonth,
    );
    const triggerAmount = category.avg3.mul(1.2);
    if (projected.lte(triggerAmount)) {
      continue;
    }

    const impactAmount = projected
      .sub(category.avg3)
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const growthPct = projected
      .sub(category.avg3)
      .div(category.avg3)
      .mul(100)
      .toDecimalPlaces(1, Prisma.Decimal.ROUND_HALF_UP);

    candidates.push({
      ruleType: "above_average",
      categoryId: category.categoryId,
      impactAmount,
      historicalMonths: category.historicalMonths,
      variables: {
        category: category.categoryName,
        projected: decimalToMoney(projected),
        avg3: decimalToMoney(category.avg3),
        amount: decimalToMoney(impactAmount),
        percent: decimalToPercent(growthPct),
      },
    });
  }

  return candidates;
}
