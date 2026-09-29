/**
 * r5.ts
 * R5 savings-gap (docs/spec/05b §5.10 Bảng 23): fires when the user is projected to miss their
 * monthly savings goal. `effectiveIncome` floors income-to-date at the allowance baseline (an
 * architect-review fix) so an early-month shortfall isn't falsely flagged before the allowance
 * transaction has actually posted.
 * Main exports: r5SavingsGap
 * Spec: docs/spec/05b §5.10 Bảng 23 (R5)
 */
import { TipRuleType } from '@campuscoin/shared';
import { Decimal, toMoneyString } from '../../../lib/money.js';
import type { SavingsGapInput, TipCandidate } from '../tips.types.js';

/**
 * Builds a single candidate when the user is on track to miss their savings goal this month.
 * @param input - Savings-gap statistics, or `null`/`savingsGoal: null` to skip entirely (no goal set).
 */
export function r5SavingsGap(input: SavingsGapInput | null): TipCandidate[] {
  if (input == null) return [];
  const effectiveIncome = Decimal.max(input.incomeToDate, input.allowanceBaseline ?? new Decimal(0));
  const projectedSavings = effectiveIncome.minus(input.projectedTotalExpense);
  if (!projectedSavings.lessThan(input.savingsGoal)) return [];

  const impact = input.savingsGoal.minus(projectedSavings);
  return [
    {
      ruleType: TipRuleType.SAVINGS_GAP,
      categoryId: null,
      categoryName: null,
      impact,
      vars: {
        amount: toMoneyString(impact),
        ...(input.topOverspendCategory ? { category: input.topOverspendCategory.categoryName } : {}),
      },
    },
  ];
}
