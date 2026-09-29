/**
 * r3.test.ts
 * Unit tests for R3 small-frequent: fires at >= TIP_SMALL_TXN_MIN_COUNT (8) matching transactions.
 * Spec: docs/spec/05b §5.10 Bảng 23 (R3)
 */
import { describe, expect, it } from 'vitest';
import { TipRuleType } from '@campuscoin/shared';
import { Decimal } from '../../../../src/lib/money.js';
import { r3SmallFrequent } from '../../../../src/modules/tips/rules/r3.js';
import type { SmallTxnCategoryStat } from '../../../../src/modules/tips/tips.types.js';

function stat(overrides: Partial<SmallTxnCategoryStat> = {}): SmallTxnCategoryStat {
  return { categoryId: 1, categoryName: 'Coffee', smallTxnCount: 8, smallTxnSum: new Decimal('40'), ...overrides };
}

describe('r3SmallFrequent', () => {
  it('does not fire at exactly 7 small transactions', () => {
    expect(r3SmallFrequent([stat({ smallTxnCount: 7 })])).toEqual([]);
  });

  it('fires at exactly 8 small transactions and computes impact as half the sum', () => {
    const candidates = r3SmallFrequent([stat({ smallTxnCount: 8, smallTxnSum: new Decimal('40') })]);
    expect(candidates).toHaveLength(1);
    const c = candidates[0]!;
    expect(c.ruleType).toBe(TipRuleType.SMALL_FREQUENT);
    expect(c.impact.toString()).toBe('20');
    expect(c.vars).toEqual({ category: 'Coffee', amount: '20.00' });
  });

  it('returns no candidates for an empty input', () => {
    expect(r3SmallFrequent([])).toEqual([]);
  });
});
