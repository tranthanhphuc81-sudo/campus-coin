/**
 * r5.test.ts
 * Unit tests for R5 savings-gap: fires when projected month-end savings fall short of the goal.
 * `effectiveIncome` floors income-to-date at the allowance baseline (architect-review fix).
 * Spec: docs/spec/05b §5.10 Bảng 23 (R5)
 */
import { describe, expect, it } from 'vitest';
import { Decimal } from '../../../../src/lib/money.js';
import { r5SavingsGap } from '../../../../src/modules/tips/rules/r5.js';
import type { SavingsGapInput } from '../../../../src/modules/tips/tips.types.js';

function input(overrides: Partial<SavingsGapInput> = {}): SavingsGapInput {
  return {
    incomeToDate: new Decimal('0'),
    allowanceBaseline: new Decimal('500'),
    projectedTotalExpense: new Decimal('300'),
    savingsGoal: new Decimal('250'),
    topOverspendCategory: null,
    ...overrides,
  };
}

describe('r5SavingsGap', () => {
  it('returns no candidate for a null input (no goal set)', () => {
    expect(r5SavingsGap(null)).toEqual([]);
  });

  it('floors income-to-date at the allowance baseline (no false shortfall before allowance posts)', () => {
    // incomeToDate=0, but allowanceBaseline=500 -> effectiveIncome=500; 500-300=200 >= goal 250? No: 200<250 -> fires.
    const candidates = r5SavingsGap(input());
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.impact.toString()).toBe('50'); // 250 - (500-300)
  });

  it('does not fire when projected savings meet the goal', () => {
    expect(r5SavingsGap(input({ savingsGoal: new Decimal('200') }))).toEqual([]);
  });

  it('includes {category} only when a top overspend category is present', () => {
    const withCategory = r5SavingsGap(input({ topOverspendCategory: { categoryName: 'Food' } }));
    expect(withCategory[0]!.vars.category).toBe('Food');

    const withoutCategory = r5SavingsGap(input({ topOverspendCategory: null }));
    expect(withoutCategory[0]!.vars.category).toBeUndefined();
  });

  it('uses raw incomeToDate when it exceeds the allowance baseline', () => {
    const candidates = r5SavingsGap(input({ incomeToDate: new Decimal('600'), allowanceBaseline: new Decimal('500'), projectedTotalExpense: new Decimal('300'), savingsGoal: new Decimal('250') }));
    // effectiveIncome = max(600,500) = 600; 600-300=300 >= 250 -> does not fire
    expect(candidates).toEqual([]);
  });
});
