/**
 * rule-state.test.ts
 * Unit tests for the pure tier-1 rule state machine (backend/src/modules/ai/ai.rules.ts): every
 * `nextRuleAction` transition and `ruleConfidence`'s hitCount threshold.
 * Spec: docs/spec/05b §5.6 (AI categorization, tier 1) · Rules: D4
 */
import { AI_CONFIDENCE_RULE, AI_CONFIDENCE_RULE_STRONG, AI_RULE_STRONG_MIN_HITS } from '@campuscoin/shared';
import { describe, expect, it } from 'vitest';
import { nextRuleAction, ruleConfidence } from '../../../src/modules/ai/ai.rules.js';

describe('nextRuleAction', () => {
  it('no existing rule -> create', () => {
    expect(nextRuleAction(null, 5)).toEqual({ op: 'create' });
  });

  it('chosen matches the rule current category -> reinforce', () => {
    expect(nextRuleAction({ categoryId: 5, pendingCategoryId: null }, 5)).toEqual({ op: 'reinforce' });
  });

  it('chosen matches the rule current category even with an unrelated pending set -> reinforce', () => {
    expect(nextRuleAction({ categoryId: 5, pendingCategoryId: 9 }, 5)).toEqual({ op: 'reinforce' });
  });

  it('chosen matches the already-pending category (second consecutive correction) -> replace', () => {
    expect(nextRuleAction({ categoryId: 5, pendingCategoryId: 9 }, 9)).toEqual({ op: 'replace' });
  });

  it('chosen differs from both current and (null) pending -> setPending (first correction)', () => {
    expect(nextRuleAction({ categoryId: 5, pendingCategoryId: null }, 9)).toEqual({ op: 'setPending' });
  });

  it('chosen differs from both current and a different pending -> setPending (new first correction)', () => {
    expect(nextRuleAction({ categoryId: 5, pendingCategoryId: 9 }, 12)).toEqual({ op: 'setPending' });
  });
});

describe('ruleConfidence', () => {
  it(`returns AI_CONFIDENCE_RULE below the strong threshold (hitCount < ${AI_RULE_STRONG_MIN_HITS})`, () => {
    expect(ruleConfidence(1)).toBe(AI_CONFIDENCE_RULE);
  });

  it(`returns AI_CONFIDENCE_RULE_STRONG at the threshold (hitCount === ${AI_RULE_STRONG_MIN_HITS})`, () => {
    expect(ruleConfidence(AI_RULE_STRONG_MIN_HITS)).toBe(AI_CONFIDENCE_RULE_STRONG);
  });

  it('returns AI_CONFIDENCE_RULE_STRONG above the threshold', () => {
    expect(ruleConfidence(AI_RULE_STRONG_MIN_HITS + 5)).toBe(AI_CONFIDENCE_RULE_STRONG);
  });
});
