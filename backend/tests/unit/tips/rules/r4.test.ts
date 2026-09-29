/**
 * r4.test.ts
 * Unit tests for R4 multiple-subscriptions: fires at >= TIP_SUBSCRIPTIONS_MIN_COUNT (3) active
 * subscriptions; impact is the smallest subscription's amount.
 * Spec: docs/spec/05b §5.10 Bảng 23 (R4)
 */
import { describe, expect, it } from 'vitest';
import { TipRuleType } from '@campuscoin/shared';
import { Decimal } from '../../../../src/lib/money.js';
import { r4Subscriptions } from '../../../../src/modules/tips/rules/r4.js';

describe('r4Subscriptions', () => {
  it('does not fire with exactly 2 subscriptions', () => {
    expect(r4Subscriptions([{ amount: new Decimal('5') }, { amount: new Decimal('10') }])).toEqual([]);
  });

  it('fires with exactly 3 subscriptions, using the smallest amount as impact', () => {
    const candidates = r4Subscriptions([{ amount: new Decimal('15') }, { amount: new Decimal('5') }, { amount: new Decimal('10') }]);
    expect(candidates).toHaveLength(1);
    const c = candidates[0]!;
    expect(c.ruleType).toBe(TipRuleType.SUBSCRIPTIONS);
    expect(c.categoryId).toBeNull();
    expect(c.impact.toString()).toBe('5');
    expect(c.vars).toEqual({ amount: '5.00' });
  });

  it('returns no candidates for an empty input', () => {
    expect(r4Subscriptions([])).toEqual([]);
  });
});
