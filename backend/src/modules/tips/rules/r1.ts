/**
 * r1.ts
 * R1 over-budget-risk (docs/spec/05b §5.10 Bảng 23): fires when a budgeted expense category's
 * projected spend for the month will exceed its budget limit.
 * Main exports: r1OverBudget
 * Spec: docs/spec/05b §5.10 Bảng 23 (R1)
 */
import { TipRuleType } from '@campuscoin/shared';
import { toMoneyString } from '../../../lib/money.js';
import type { BudgetedCategoryStat, TipCandidate } from '../tips.types.js';

/**
 * Builds one candidate per budgeted category whose projected month-end spend exceeds its limit.
 * @param categories - Budgeted expense categories with their projected spend for the month.
 */
export function r1OverBudget(categories: readonly BudgetedCategoryStat[]): TipCandidate[] {
  const candidates: TipCandidate[] = [];
  for (const c of categories) {
    if (!c.projected.greaterThan(c.limit)) continue;
    const impact = c.projected.minus(c.limit);
    candidates.push({
      ruleType: TipRuleType.OVER_BUDGET,
      categoryId: c.categoryId,
      categoryName: c.categoryName,
      impact,
      vars: {
        category: c.categoryName,
        amount: toMoneyString(impact),
        percent: toMoneyString(c.projected.dividedBy(c.limit).times(100), 0),
      },
    });
  }
  return candidates;
}
