/**
 * r1.test.ts
 * Unit tests for R1 over-budget-risk: fires when projected(c) > limit(c).
 * Spec: docs/spec/05b §5.10 Bảng 23 (R1)
 */
import { describe, expect, it } from 'vitest';
import { TipRuleType } from '@campuscoin/shared';
import { Decimal } from '../../../../src/lib/money.js';
import { r1OverBudget } from '../../../../src/modules/tips/rules/r1.js';
import type { BudgetedCategoryStat } from '../../../../src/modules/tips/tips.types.js';

function stat(overrides: Partial<BudgetedCategoryStat> = {}): BudgetedCategoryStat {
  return { categoryId: 1, categoryName: 'Food', projected: new Decimal('100'), limit: new Decimal('100'), ...overrides };
}

describe('r1OverBudget', () => {
  it('does not fire exactly at the boundary (projected == limit)', () => {
    expect(r1OverBudget([stat({ projected: new Decimal('100'), limit: new Decimal('100') })])).toHaveLength(0);
  });

  it('fires just over the boundary and computes impact/percent', () => {
    const candidates = r1OverBudget([stat({ projected: new Decimal('120'), limit: new Decimal('100') })]);
    expect(candidates).toHaveLength(1);
    const c = candidates[0]!;
    expect(c.ruleType).toBe(TipRuleType.OVER_BUDGET);
    expect(c.categoryId).toBe(1);
    expect(c.impact.toString()).toBe('20');
    expect(c.vars).toEqual({ category: 'Food', amount: '20.00', percent: '120' });
  });

  it('skips categories under budget and only returns the ones over', () => {
    const candidates = r1OverBudget([
      stat({ categoryId: 1, projected: new Decimal('50'), limit: new Decimal('100') }),
      stat({ categoryId: 2, projected: new Decimal('150'), limit: new Decimal('100') }),
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.categoryId).toBe(2);
  });

  it('returns no candidates for an empty input', () => {
    expect(r1OverBudget([])).toEqual([]);
  });
});
