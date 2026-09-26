import { Prisma } from "@prisma/client";

import { decimalToMoney, type TipCandidate, type TipRuleEvaluationContext } from "./types.js";

export function evaluateSmallFrequentRule(context: TipRuleEvaluationContext): TipCandidate[] {
  if (!context.allowanceBaseline || context.allowanceBaseline.lte(0)) {
    return [];
  }

  const maxSmallAmount = context.allowanceBaseline.mul(0.05);
  const byCategory = new Map<number, { total: Prisma.Decimal; count: number }>();

  for (const transaction of context.recentExpenseTransactions) {
    if (transaction.amount.gte(maxSmallAmount)) {
      continue;
    }

    const current = byCategory.get(transaction.categoryId) ?? {
      total: new Prisma.Decimal(0),
      count: 0,
    };

    current.total = current.total.add(transaction.amount);
    current.count += 1;
    byCategory.set(transaction.categoryId, current);
  }

  const candidates: TipCandidate[] = [];

  for (const category of context.categorySpending) {
    const grouped = byCategory.get(category.categoryId);
    if (!grouped || grouped.count < 8) {
      continue;
    }

    const impactAmount = grouped.total.mul(0.5).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

    candidates.push({
      ruleType: "small_frequent",
      categoryId: category.categoryId,
      impactAmount,
      historicalMonths: Math.max(1, category.historicalMonths),
      variables: {
        category: category.categoryName,
        count: String(grouped.count),
        total: decimalToMoney(grouped.total),
        amount: decimalToMoney(impactAmount),
      },
    });
  }

  return candidates;
}
