import { Prisma } from "@prisma/client";

import { decimalToMoney, type TipCandidate, type TipRuleEvaluationContext } from "./types.js";

export function evaluateSubscriptionsRule(context: TipRuleEvaluationContext): TipCandidate[] {
  if (context.recurringSubscriptions.length < 3) {
    return [];
  }

  const sortedByAmount = [...context.recurringSubscriptions].sort((left, right) =>
    left.amount.comparedTo(right.amount),
  );

  const smallest = sortedByAmount[0];
  if (!smallest) {
    return [];
  }

  const impactAmount = smallest.amount.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

  return [
    {
      ruleType: "subscriptions",
      categoryId: smallest.categoryId,
      impactAmount,
      historicalMonths: 1,
      variables: {
        category: smallest.categoryName,
        count: String(context.recurringSubscriptions.length),
        amount: decimalToMoney(impactAmount),
      },
    },
  ];
}
