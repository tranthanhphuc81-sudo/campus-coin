import type { InsightGenerationResult, PromptStatsInput } from "./types.js";

export const SUBSTITUTION_TIPS: Record<string, string> = {
  food: "Cook at your dorm kitchen or batch-cook on weekends instead of ordering out.",
  transport: "Switch to a monthly student bus/transit pass instead of paying per ride.",
  "hostel/rent": "Compare a shared room or a roommate split before your next lease renewal.",
  academics: "Buy used textbooks or check the library/student marketplace before buying new.",
  subscriptions: "Cancel or pause subscriptions you have not opened in the last 30 days.",
  entertainment: "Look for student-discount or free on-campus events instead of paid outings.",
  miscellaneous: "Track this category for a week and set a small weekly cap to watch it closely.",
  default: "Track this category for a week and set a small weekly cap to watch it closely.",
};

function templateTopPattern(input: PromptStatsInput): InsightGenerationResult | null {
  const firstPattern = input.topPatterns[0];
  if (!firstPattern || !input.weeklyCapSuggestion) {
    return null;
  }

  return {
    summaryText: `Your spending on ${firstPattern.category} was ${firstPattern.curAmount} ${input.currency} this month, up ${firstPattern.growthPct}% from your usual ${firstPattern.avg3Amount} ${input.currency}.`,
    tipText: `Try a weekly cap of ${input.weeklyCapSuggestion.amount} ${input.currency} for ${input.weeklyCapSuggestion.category}. ${input.weeklyCapSuggestion.substitutionTip}`,
    generator: "template",
  };
}

function templateGoodSavings(input: PromptStatsInput): InsightGenerationResult | null {
  if (input.savingsRatePct === null || input.savingsRatePct < 20) {
    return null;
  }

  return {
    summaryText: `Great job! You saved about ${input.savingsRatePct}% of your income this month.`,
    tipText:
      "Keep it up, and consider setting aside a small fixed amount each month toward your savings goal.",
    generator: "template",
  };
}

function templateSteady(input: PromptStatsInput): InsightGenerationResult {
  const missingIncomeNote =
    input.savingsRatePct === null
      ? " We could not calculate a savings rate because no income was recorded."
      : "";

  return {
    summaryText: `Your spending stayed steady this month with no unusual category changes.${missingIncomeNote}`,
    tipText:
      "Keep logging your transactions so we can spot useful patterns as more months come in.",
    generator: "template",
  };
}

export function buildTemplateInsight(input: PromptStatsInput): InsightGenerationResult {
  return templateTopPattern(input) ?? templateGoodSavings(input) ?? templateSteady(input);
}
