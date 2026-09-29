/**
 * r2.ts
 * R2 above-average (docs/spec/05b §5.10 Bảng 23): fires when an expense category's projected
 * month-end spend exceeds its 3-month average by at least `TIP_ABOVE_AVERAGE_MULTIPLIER`. No
 * ">=2 non-null months" gate here (unlike the separate insights module) — the confidence score
 * already accounts for how little history is available.
 * Main exports: r2AboveAverage
 * Spec: docs/spec/05b §5.10 Bảng 23 (R2)
 */
import { TIP_ABOVE_AVERAGE_MULTIPLIER, TipRuleType } from '@campuscoin/shared';
import { toMoneyString } from '../../../lib/money.js';
import type { AverageCategoryStat, TipCandidate } from '../tips.types.js';

/**
 * Builds one candidate per category whose projected spend is well above its 3-month average.
 * @param categories - Expense categories with spend this month, plus their 3-month average.
 */
export function r2AboveAverage(categories: readonly AverageCategoryStat[]): TipCandidate[] {
  const candidates: TipCandidate[] = [];
  for (const c of categories) {
    if (c.avg3 == null) continue;
    const threshold = c.avg3.times(TIP_ABOVE_AVERAGE_MULTIPLIER);
    if (!c.projected.greaterThan(threshold)) continue;
    const impact = c.projected.minus(c.avg3);
    candidates.push({
      ruleType: TipRuleType.ABOVE_AVERAGE,
      categoryId: c.categoryId,
      categoryName: c.categoryName,
      impact,
      vars: {
        category: c.categoryName,
        amount: toMoneyString(impact),
        percent: toMoneyString(c.projected.minus(c.avg3).dividedBy(c.avg3).times(100), 0),
      },
    });
  }
  return candidates;
}
