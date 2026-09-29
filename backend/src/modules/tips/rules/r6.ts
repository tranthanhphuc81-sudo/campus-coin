/**
 * r6.ts
 * R6 weekend-spike (docs/spec/05b §5.10 Bảng 23): fires when the most recent weekend's spend
 * exceeds `TIP_WEEKEND_SPIKE_MULTIPLIER` times the trailing-4-week average weekday spend. Spans
 * all categories — `categoryId`/`categoryName` are `null`.
 * Main exports: r6WeekendSpike
 * Spec: docs/spec/05b §5.10 Bảng 23 (R6)
 */
import { TIP_WEEKEND_SPIKE_MULTIPLIER, TipRuleType } from '@campuscoin/shared';
import { toMoneyString } from '../../../lib/money.js';
import type { TipCandidate, WeekendStat } from '../tips.types.js';

/**
 * Builds a single candidate when the latest weekend's spend is a spike vs. the weekday baseline.
 * @param input - Weekend/weekday totals, or `null` (no data) to skip.
 */
export function r6WeekendSpike(input: WeekendStat | null): TipCandidate[] {
  if (input == null || !input.avgWeekdaySpend.greaterThan(0)) return [];

  const threshold = input.avgWeekdaySpend.times(TIP_WEEKEND_SPIKE_MULTIPLIER);
  if (!input.weekendTotal.greaterThan(threshold)) return [];

  const impact = input.weekendTotal.minus(threshold);
  const denominator = input.weekendTotal.plus(input.weekWeekdayTotal);
  return [
    {
      ruleType: TipRuleType.WEEKEND_SPIKE,
      categoryId: null,
      categoryName: null,
      impact,
      vars: {
        amount: toMoneyString(impact),
        ...(denominator.greaterThan(0)
          ? { percent: toMoneyString(input.weekendTotal.dividedBy(denominator).times(100), 0) }
          : {}),
      },
    },
  ];
}
