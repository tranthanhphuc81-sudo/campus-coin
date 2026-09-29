/**
 * r3.ts
 * R3 small-frequent (docs/spec/05b §5.10 Bảng 23): fires when a category accumulates many small
 * transactions in the trailing window. The repository already restricts the input to transactions
 * below the user's small-transaction threshold within `TIP_SMALL_TXN_WINDOW_DAYS`.
 * Main exports: r3SmallFrequent
 * Spec: docs/spec/05b §5.10 Bảng 23 (R3)
 */
import { TIP_SMALL_TXN_IMPACT_SHARE, TIP_SMALL_TXN_MIN_COUNT, TipRuleType } from '@campuscoin/shared';
import { toMoneyString } from '../../../lib/money.js';
import type { SmallTxnCategoryStat, TipCandidate } from '../tips.types.js';

/**
 * Builds one candidate per category with at least `TIP_SMALL_TXN_MIN_COUNT` small transactions.
 * @param categories - Small-transaction counts/sums per category in the trailing window.
 */
export function r3SmallFrequent(categories: readonly SmallTxnCategoryStat[]): TipCandidate[] {
  const candidates: TipCandidate[] = [];
  for (const c of categories) {
    if (c.smallTxnCount < TIP_SMALL_TXN_MIN_COUNT) continue;
    const impact = c.smallTxnSum.times(TIP_SMALL_TXN_IMPACT_SHARE);
    candidates.push({
      ruleType: TipRuleType.SMALL_FREQUENT,
      categoryId: c.categoryId,
      categoryName: c.categoryName,
      impact,
      vars: { category: c.categoryName, amount: toMoneyString(impact) },
    });
  }
  return candidates;
}
