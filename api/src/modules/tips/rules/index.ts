import { Prisma } from "@prisma/client";

import { evaluateAboveAverageRule } from "./r2-above-average.js";
import { evaluateOverBudgetRule } from "./r1-over-budget.js";
import { evaluateSavingsGapRule } from "./r5-savings-gap.js";
import { evaluateSmallFrequentRule } from "./r3-small-frequent.js";
import { evaluateSubscriptionsRule } from "./r4-subscriptions.js";
import { evaluateWeekendSpikeRule } from "./r6-weekend-spike.js";
import { type TipCandidate, type TipRuleEvaluationContext } from "./types.js";

export function evaluateAllRuleCandidates(context: TipRuleEvaluationContext): TipCandidate[] {
  return [
    ...evaluateOverBudgetRule(context),
    ...evaluateAboveAverageRule(context),
    ...evaluateSmallFrequentRule(context),
    ...evaluateSubscriptionsRule(context),
    ...evaluateSavingsGapRule(context),
    ...evaluateWeekendSpikeRule(context),
  ];
}

export function evaluateGeneralRule(): TipCandidate {
  return {
    ruleType: "general",
    impactAmount: new Prisma.Decimal(1),
    historicalMonths: 1,
    variables: {},
  };
}
