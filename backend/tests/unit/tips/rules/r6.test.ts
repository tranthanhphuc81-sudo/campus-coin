/**
 * r6.test.ts
 * Unit tests for R6 weekend-spike: fires when weekendTotal > avgWeekdaySpend x TIP_WEEKEND_SPIKE_MULTIPLIER (3).
 * Spec: docs/spec/05b §5.10 Bảng 23 (R6)
 */
import { describe, expect, it } from 'vitest';
import { TipRuleType } from '@campuscoin/shared';
import { Decimal } from '../../../../src/lib/money.js';
import { r6WeekendSpike } from '../../../../src/modules/tips/rules/r6.js';
import type { WeekendStat } from '../../../../src/modules/tips/tips.types.js';

function stat(overrides: Partial<WeekendStat> = {}): WeekendStat {
  return { weekendTotal: new Decimal('100'), avgWeekdaySpend: new Decimal('30'), weekWeekdayTotal: new Decimal('60'), ...overrides };
}

describe('r6WeekendSpike', () => {
  it('returns no candidate for a null input', () => {
    expect(r6WeekendSpike(null)).toEqual([]);
  });

  it('returns no candidate when avgWeekdaySpend is 0 (no baseline)', () => {
    expect(r6WeekendSpike(stat({ avgWeekdaySpend: new Decimal('0') }))).toEqual([]);
  });

  it('does not fire exactly at the 3x boundary', () => {
    expect(r6WeekendSpike(stat({ weekendTotal: new Decimal('90'), avgWeekdaySpend: new Decimal('30') }))).toEqual([]);
  });

  it('fires just over the 3x boundary and computes impact/percent', () => {
    const candidates = r6WeekendSpike(stat({ weekendTotal: new Decimal('100'), avgWeekdaySpend: new Decimal('30'), weekWeekdayTotal: new Decimal('60') }));
    expect(candidates).toHaveLength(1);
    const c = candidates[0]!;
    expect(c.ruleType).toBe(TipRuleType.WEEKEND_SPIKE);
    expect(c.categoryId).toBeNull();
    expect(c.impact.toString()).toBe('10'); // 100 - 30*3
    expect(c.vars.amount).toBe('10.00');
    expect(c.vars.percent).toBe('63'); // 100/(100+60)*100 rounded half-up
  });
});
