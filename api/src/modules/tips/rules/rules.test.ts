import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { evaluateOverBudgetRule } from "./r1-over-budget.js";
import { evaluateAboveAverageRule } from "./r2-above-average.js";
import { evaluateSmallFrequentRule } from "./r3-small-frequent.js";
import { evaluateSubscriptionsRule } from "./r4-subscriptions.js";
import { evaluateSavingsGapRule } from "./r5-savings-gap.js";
import { evaluateWeekendSpikeRule } from "./r6-weekend-spike.js";
import type { TipRuleEvaluationContext } from "./types.js";

function baseContext(): TipRuleEvaluationContext {
  return {
    daysElapsed: 10,
    daysInMonth: 30,
    categorySpending: [
      {
        categoryId: 1,
        categoryName: "Food",
        spentToDate: new Prisma.Decimal("120.00"),
        avg3: new Prisma.Decimal("200.00"),
        historicalMonths: 3,
        budgetLimit: new Prisma.Decimal("300.00"),
      },
    ],
    recentExpenseTransactions: [],
    recurringSubscriptions: [],
    monthIncome: new Prisma.Decimal("1000.00"),
    projectedTotalExpense: new Prisma.Decimal("600.00"),
    monthlySavingsGoal: new Prisma.Decimal("300.00"),
    allowanceBaseline: new Prisma.Decimal("200.00"),
  };
}

describe("Tips rules", () => {
  it("does not trigger R1 and R2 before day 5", () => {
    const context = {
      ...baseContext(),
      daysElapsed: 4,
    };

    expect(evaluateOverBudgetRule(context)).toHaveLength(0);
    expect(evaluateAboveAverageRule(context)).toHaveLength(0);
  });

  it("triggers R3 when exactly 8 small transactions happen in 7 days", () => {
    const context = {
      ...baseContext(),
      recentExpenseTransactions: Array.from({ length: 8 }).map(() => ({
        categoryId: 1,
        amount: new Prisma.Decimal("5.00"),
        txnDate: new Date("2026-09-10T00:00:00.000Z"),
      })),
    };

    const tips = evaluateSmallFrequentRule(context);
    expect(tips).toHaveLength(1);
    expect(tips[0]?.variables.count).toBe("8");
  });

  it("triggers R4 when there are 3 subscriptions", () => {
    const context = {
      ...baseContext(),
      recurringSubscriptions: [
        { categoryId: 7, categoryName: "Subscriptions", amount: new Prisma.Decimal("4.99") },
        { categoryId: 7, categoryName: "Subscriptions", amount: new Prisma.Decimal("7.99") },
        { categoryId: 7, categoryName: "Subscriptions", amount: new Prisma.Decimal("9.99") },
      ],
    };

    const tips = evaluateSubscriptionsRule(context);
    expect(tips).toHaveLength(1);
    expect(tips[0]?.impactAmount.toFixed(2)).toBe("4.99");
  });

  it("triggers R5 when projected net is lower than goal", () => {
    const context = {
      ...baseContext(),
      monthIncome: new Prisma.Decimal("500.00"),
      projectedTotalExpense: new Prisma.Decimal("450.00"),
      monthlySavingsGoal: new Prisma.Decimal("100.00"),
    };

    const tips = evaluateSavingsGapRule(context);
    expect(tips).toHaveLength(1);
    expect(tips[0]?.impactAmount.toFixed(2)).toBe("50.00");
  });

  it("triggers R6 when weekend spending is much higher than weekdays", () => {
    const context = {
      ...baseContext(),
      recentExpenseTransactions: [
        {
          categoryId: 1,
          amount: new Prisma.Decimal("10.00"),
          txnDate: new Date("2026-09-07T00:00:00.000Z"),
        },
        {
          categoryId: 1,
          amount: new Prisma.Decimal("10.00"),
          txnDate: new Date("2026-09-08T00:00:00.000Z"),
        },
        {
          categoryId: 1,
          amount: new Prisma.Decimal("10.00"),
          txnDate: new Date("2026-09-09T00:00:00.000Z"),
        },
        {
          categoryId: 1,
          amount: new Prisma.Decimal("10.00"),
          txnDate: new Date("2026-09-10T00:00:00.000Z"),
        },
        {
          categoryId: 1,
          amount: new Prisma.Decimal("10.00"),
          txnDate: new Date("2026-09-11T00:00:00.000Z"),
        },
        {
          categoryId: 1,
          amount: new Prisma.Decimal("80.00"),
          txnDate: new Date("2026-09-12T00:00:00.000Z"),
        },
        {
          categoryId: 1,
          amount: new Prisma.Decimal("80.00"),
          txnDate: new Date("2026-09-13T00:00:00.000Z"),
        },
      ],
    };

    const tips = evaluateWeekendSpikeRule(context);
    expect(tips).toHaveLength(1);
    expect(tips[0]?.impactAmount.gt(0)).toBe(true);
  });
});
