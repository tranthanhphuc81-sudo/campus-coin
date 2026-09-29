/**
 * r4.ts
 * R4 multiple-subscriptions (docs/spec/05b §5.10 Bảng 23): fires when the user has at least
 * `TIP_SUBSCRIPTIONS_MIN_COUNT` active recurring expense rules in the Subscriptions category.
 * Spans multiple subscriptions, not one category — `categoryId`/`categoryName` are `null`.
 * Main exports: r4Subscriptions
 * Spec: docs/spec/05b §5.10 Bảng 23 (R4)
 */
import { TIP_SUBSCRIPTIONS_MIN_COUNT, TipRuleType } from '@campuscoin/shared';
import { toMoneyString } from '../../../lib/money.js';
import type { SubscriptionStat, TipCandidate } from '../tips.types.js';

/**
 * Builds a single candidate when there are enough active subscriptions.
 * @param subscriptions - Active expense recurring rules matched to the Subscriptions category.
 */
export function r4Subscriptions(subscriptions: readonly SubscriptionStat[]): TipCandidate[] {
  if (subscriptions.length < TIP_SUBSCRIPTIONS_MIN_COUNT) return [];
  const impact = subscriptions.reduce((min, s) => (s.amount.lessThan(min) ? s.amount : min), subscriptions[0]!.amount);
  return [
    {
      ruleType: TipRuleType.SUBSCRIPTIONS,
      categoryId: null,
      categoryName: null,
      impact,
      vars: { amount: toMoneyString(impact) },
    },
  ];
}
