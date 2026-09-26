import { Prisma } from "@prisma/client";

export type TipRuleType =
  | "over_budget"
  | "above_average"
  | "small_frequent"
  | "subscriptions"
  | "savings_gap"
  | "weekend_spike"
  | "general";

export type TipCandidate = {
  ruleType: TipRuleType;
  categoryId?: number;
  impactAmount: Prisma.Decimal;
  historicalMonths: number;
  variables: Record<string, string>;
};

export type CategorySpendingContext = {
  categoryId: number;
  categoryName: string;
  spentToDate: Prisma.Decimal;
  avg3: Prisma.Decimal;
  historicalMonths: number;
  budgetLimit: Prisma.Decimal | null;
};

export type RecentExpenseTransaction = {
  categoryId: number;
  amount: Prisma.Decimal;
  txnDate: Date;
};

export type SubscriptionContext = {
  categoryId: number;
  categoryName: string;
  amount: Prisma.Decimal;
};

export type TipRuleEvaluationContext = {
  daysElapsed: number;
  daysInMonth: number;
  categorySpending: CategorySpendingContext[];
  recentExpenseTransactions: RecentExpenseTransaction[];
  recurringSubscriptions: SubscriptionContext[];
  monthIncome: Prisma.Decimal;
  projectedTotalExpense: Prisma.Decimal;
  monthlySavingsGoal: Prisma.Decimal | null;
  allowanceBaseline: Prisma.Decimal | null;
};

export function calculateProjectedAmount(
  spentToDate: Prisma.Decimal,
  daysElapsed: number,
  daysInMonth: number,
): Prisma.Decimal {
  if (daysElapsed < 5) {
    return new Prisma.Decimal(0);
  }

  return spentToDate
    .div(daysElapsed)
    .mul(daysInMonth)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export function decimalToMoney(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

export function decimalToPercent(value: Prisma.Decimal): string {
  return value.toDecimalPlaces(1, Prisma.Decimal.ROUND_HALF_UP).toFixed(1);
}
