import { Prisma } from "@prisma/client";

import { decimalToMoney, type TipCandidate, type TipRuleEvaluationContext } from "./types.js";

export function evaluateSavingsGapRule(context: TipRuleEvaluationContext): TipCandidate[] {
  if (!context.monthlySavingsGoal || context.monthlySavingsGoal.lte(0)) {
    return [];
  }

  const projectedNet = context.monthIncome.sub(context.projectedTotalExpense);
  if (projectedNet.gte(context.monthlySavingsGoal)) {
    return [];
  }

  const gap = context.monthlySavingsGoal
    .sub(projectedNet)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

  return [
    {
      ruleType: "savings_gap",
      impactAmount: gap,
      historicalMonths: 1,
      variables: {
        goal: decimalToMoney(context.monthlySavingsGoal),
        projectedNet: decimalToMoney(projectedNet),
        amount: decimalToMoney(gap),
      },
    },
  ];
}
