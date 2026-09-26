import { describe, expect, it } from "vitest";

import { computeMonthStats, toPromptStatsInput } from "./stats.js";
import { SUBSTITUTION_TIPS } from "./templates.js";

describe("computeMonthStats", () => {
  it("builds top pattern with 40% growth for Food (ADR fixture 1)", () => {
    const snapshot = computeMonthStats({
      userId: "u-001",
      month: "2026-08",
      currency: "USD",
      baselineAllowance: "300.00",
      totalIncome: "450.00",
      totalExpense: "380.00",
      largestAnomaly: null,
      categories: [
        {
          categoryId: 1,
          name: "Food",
          cur: "140.00",
          budgetLimit: "160.00",
          history: [
            { month: "2026-07", amount: "95.00", hasActivity: true },
            { month: "2026-06", amount: "105.00", hasActivity: true },
            { month: "2026-05", amount: "100.00", hasActivity: true },
          ],
        },
        {
          categoryId: 2,
          name: "Transport",
          cur: "40.00",
          budgetLimit: "80.00",
          history: [
            { month: "2026-07", amount: "38.00", hasActivity: true },
            { month: "2026-06", amount: "42.00", hasActivity: true },
            { month: "2026-05", amount: "0.00", hasActivity: false },
          ],
        },
      ],
    });

    expect(snapshot.topPatterns).toHaveLength(1);
    expect(snapshot.topPatterns[0]).toMatchObject({
      name: "Food",
      cur: "140.00",
      avg3: "100.00",
      g: 0.4,
      absDiff: "40.00",
      flagged: true,
    });

    const prompt = toPromptStatsInput(snapshot, SUBSTITUTION_TIPS);
    expect(prompt.topPatterns[0]?.growthPct).toBe(40);
  });

  it("returns savingsRate null when monthly income is zero (ADR fixture 2)", () => {
    const snapshot = computeMonthStats({
      userId: "u-002",
      month: "2026-08",
      currency: "USD",
      baselineAllowance: null,
      totalIncome: "0.00",
      totalExpense: "120.00",
      largestAnomaly: null,
      categories: [
        {
          categoryId: 1,
          name: "Food",
          cur: "120.00",
          budgetLimit: null,
          history: [
            { month: "2026-07", amount: "0.00", hasActivity: false },
            { month: "2026-06", amount: "0.00", hasActivity: false },
            { month: "2026-05", amount: "0.00", hasActivity: false },
          ],
        },
      ],
    });

    expect(snapshot.savingsRate).toBeNull();
    expect(snapshot.topPatterns).toHaveLength(0);
    expect(snapshot.newCategories).toEqual([
      {
        categoryId: 1,
        name: "Food",
        cur: "120.00",
      },
    ]);
  });

  it("formats VND weekly cap with 0 decimals (ADR fixture 3)", () => {
    const snapshot = computeMonthStats({
      userId: "u-003",
      month: "2026-08",
      currency: "VND",
      baselineAllowance: "8000000",
      totalIncome: "10000000",
      totalExpense: "7000000",
      largestAnomaly: null,
      categories: [
        {
          categoryId: 7,
          name: "Food",
          cur: "2200000",
          budgetLimit: null,
          history: [
            { month: "2026-07", amount: "1500000", hasActivity: true },
            { month: "2026-06", amount: "1600000", hasActivity: true },
            { month: "2026-05", amount: "1700000", hasActivity: true },
          ],
        },
      ],
    });

    expect(snapshot.weeklyCapSuggestion).toEqual({
      categoryId: 7,
      categoryName: "Food",
      amount: "369515",
    });
  });
});
