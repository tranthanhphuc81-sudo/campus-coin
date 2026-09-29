/**
 * r0.test.ts
 * Unit tests for the R0 general rule (always-eligible, fixed-score fallback tip).
 * Spec: docs/spec/05b §5.10 Bảng 23 (R0)
 */
import { describe, expect, it } from 'vitest';
import { TipRuleType } from '@campuscoin/shared';
import { r0General } from '../../../../src/modules/tips/rules/r0.js';

describe('r0General', () => {
  it('always returns exactly one candidate with zero impact and no vars', () => {
    const candidates = r0General();
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ ruleType: TipRuleType.GENERAL, categoryId: null, categoryName: null, vars: {} });
    expect(candidates[0]!.impact.toString()).toBe('0');
  });
});
