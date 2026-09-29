/**
 * r2.test.ts
 * Unit tests for R2 above-average: fires when projected(c) > avg3(c) x TIP_ABOVE_AVERAGE_MULTIPLIER.
 * Spec: docs/spec/05b §5.10 Bảng 23 (R2)
 */
import { describe, expect, it } from 'vitest';
import { TipRuleType } from '@campuscoin/shared';
import { Decimal } from '../../../../src/lib/money.js';
import { r2AboveAverage } from '../../../../src/modules/tips/rules/r2.js';
import type { AverageCategoryStat } from '../../../../src/modules/tips/tips.types.js';

function stat(overrides: Partial<AverageCategoryStat> = {}): AverageCategoryStat {
  return { categoryId: 1, categoryName: 'Food', projected: new Decimal('120'), avg3: new Decimal('100'), ...overrides };
}

describe('r2AboveAverage', () => {
  it('skips a category with no history (avg3 == null)', () => {
    expect(r2AboveAverage([stat({ avg3: null })])).toEqual([]);
  });

  it('does not fire exactly at the 1.2x boundary', () => {
    expect(r2AboveAverage([stat({ projected: new Decimal('120'), avg3: new Decimal('100') })])).toEqual([]);
  });

  it('fires just over the 1.2x boundary and computes impact/percent', () => {
    const candidates = r2AboveAverage([stat({ projected: new Decimal('120.01'), avg3: new Decimal('100') })]);
    expect(candidates).toHaveLength(1);
    const c = candidates[0]!;
    expect(c.ruleType).toBe(TipRuleType.ABOVE_AVERAGE);
    expect(c.impact.toString()).toBe('20.01');
    expect(c.vars.category).toBe('Food');
    expect(c.vars.amount).toBe('20.01');
    expect(c.vars.percent).toBe('20'); // (120.01-100)/100*100 rounded half-up
  });

  it('returns no candidates for an empty input', () => {
    expect(r2AboveAverage([])).toEqual([]);
  });
});
