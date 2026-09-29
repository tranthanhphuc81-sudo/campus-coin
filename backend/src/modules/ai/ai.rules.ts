/**
 * ai.rules.ts
 * Pure state-machine for tier-1 personal categorization rules (`ai_category_rules`). Decides what
 * to do with an existing rule (or the lack of one) when the user picks `chosenCategoryId`, and how
 * confident a rule is given its `hitCount`. No I/O — `ai.repository.ts` applies the decision.
 * Main exports: nextRuleAction, ruleConfidence
 * Spec: docs/spec/05b §5.6 (AI categorization, tier 1) · Rules: D4
 */
import { AI_CONFIDENCE_RULE, AI_CONFIDENCE_RULE_STRONG, AI_RULE_STRONG_MIN_HITS } from '@campuscoin/shared';

/** Minimal shape of an existing rule needed to decide the next action. */
export interface RuleState {
  categoryId: number;
  pendingCategoryId: number | null;
}

/** What {@link nextRuleAction} decided to do; `ai.repository.ts` maps each to one DB operation. */
export type RuleAction = { op: 'create' } | { op: 'reinforce' } | { op: 'setPending' } | { op: 'replace' };

/**
 * Decides the next action for a user's category choice against their existing rule (if any):
 * - No rule yet -> create one.
 * - Chooses the rule's current category -> reinforce it (hitCount += 1).
 * - Chooses the rule's already-pending category (D4: second consecutive identical correction) ->
 *   replace the rule outright with that category.
 * - Chooses anything else -> set it as the rule's pending category (first correction).
 * @param rule - The user's existing rule for this merchant, or `null` if none exists yet.
 * @param chosenCategoryId - The category the user just picked/confirmed.
 */
export function nextRuleAction(rule: RuleState | null, chosenCategoryId: number): RuleAction {
  if (!rule) return { op: 'create' };
  if (chosenCategoryId === rule.categoryId) return { op: 'reinforce' };
  if (rule.pendingCategoryId !== null && chosenCategoryId === rule.pendingCategoryId) return { op: 'replace' };
  return { op: 'setPending' };
}

/**
 * Tier-1 confidence for a rule, based on how many times it has been reinforced.
 * @param hitCount - Current `hitCount` of the rule.
 * @returns {@link AI_CONFIDENCE_RULE_STRONG} once reinforced `AI_RULE_STRONG_MIN_HITS`+ times, else {@link AI_CONFIDENCE_RULE}.
 */
export function ruleConfidence(hitCount: number): string {
  return hitCount >= AI_RULE_STRONG_MIN_HITS ? AI_CONFIDENCE_RULE_STRONG : AI_CONFIDENCE_RULE;
}
