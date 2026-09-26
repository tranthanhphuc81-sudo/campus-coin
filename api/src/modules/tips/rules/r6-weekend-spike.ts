import { Prisma } from "@prisma/client";

import {
  decimalToMoney,
  decimalToPercent,
  type TipCandidate,
  type TipRuleEvaluationContext,
} from "./types.js";

function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

export function evaluateWeekendSpikeRule(context: TipRuleEvaluationContext): TipCandidate[] {
  if (context.recentExpenseTransactions.length === 0) {
    return [];
  }

  let weekendTotal = new Prisma.Decimal(0);
  let weekdayTotal = new Prisma.Decimal(0);
  let weekdayCount = 0;

  for (const transaction of context.recentExpenseTransactions) {
    if (isWeekend(transaction.txnDate)) {
      weekendTotal = weekendTotal.add(transaction.amount);
    } else {
      weekdayTotal = weekdayTotal.add(transaction.amount);
      weekdayCount += 1;
    }
  }

  if (weekdayCount === 0) {
    return [];
  }

  const weekdayAverage = weekdayTotal.div(weekdayCount);
  const threshold = weekdayAverage.mul(2).mul(1.5);

  if (weekendTotal.lte(threshold)) {
    return [];
  }

  const impactAmount = weekendTotal.sub(threshold).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const totalExpense = weekendTotal.add(weekdayTotal);
  const weekendSharePct = totalExpense.gt(0)
    ? weekendTotal.div(totalExpense).mul(100).toDecimalPlaces(1, Prisma.Decimal.ROUND_HALF_UP)
    : new Prisma.Decimal(0);

  return [
    {
      ruleType: "weekend_spike",
      impactAmount,
      historicalMonths: 1,
      variables: {
        weekendAmount: decimalToMoney(weekendTotal),
        weekdayAverage: decimalToMoney(weekdayAverage),
        amount: decimalToMoney(impactAmount),
        percent: decimalToPercent(weekendSharePct),
      },
    },
  ];
}
