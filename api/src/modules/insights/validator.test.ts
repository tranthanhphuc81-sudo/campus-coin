import { describe, expect, it } from "vitest";

import type { PromptStatsInput } from "./types.js";
import { validateInsightText } from "./validator.js";

describe("validateInsightText", () => {
  const promptStats: PromptStatsInput = {
    month: "2026-08",
    currency: "USD",
    totalIncome: "450.00",
    totalExpense: "380.00",
    savingsRatePct: 15.6,
    topPatterns: [
      {
        category: "Food",
        curAmount: "140.00",
        avg3Amount: "100.00",
        growthPct: 40,
      },
    ],
    newCategories: [],
    largestAnomaly: null,
    weeklyCapSuggestion: {
      category: "Food",
      amount: "23.09",
      substitutionTip: "Cook at your dorm kitchen instead of ordering out.",
    },
  };

  it("rejects hallucinated percentage when text says 55% but snapshot says 40%", () => {
    const result = validateInsightText(
      {
        summaryText: "Food spending increased by 55% this month.",
        tipText: "Try a weekly cap of 23.09 USD for Food.",
      },
      promptStats,
    );

    expect(result.ok).toBe(false);
  });

  it("accepts text that only uses snapshot numbers", () => {
    const result = validateInsightText(
      {
        summaryText: "Food spending increased by 40% this month to 140.00 USD.",
        tipText: "Try a weekly cap of 23.09 USD for Food.",
      },
      promptStats,
    );

    expect(result.ok).toBe(true);
  });
});
