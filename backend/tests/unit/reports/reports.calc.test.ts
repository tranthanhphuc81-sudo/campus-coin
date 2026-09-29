/**
 * reports.calc.test.ts
 * Unit tests for `reports.service.ts`'s period-over-period percentage-change calculation
 * (docs/spec/05b §5.8: "so sánh kỳ trước cùng độ dài" — every report figure compared against the
 * immediately preceding period of the same length).
 * Spec: docs/spec/05b §5.8 · docs/spec/12 (testing plan)
 */
import { describe, expect, it } from 'vitest';
import { Decimal } from '../../../src/lib/money.js';
import { changePct } from '../../../src/modules/reports/reports.service.js';

describe('changePct', () => {
  it('computes a positive % increase, rounded half-up', () => {
    expect(changePct(new Decimal('40'), new Decimal('20'))).toBe(100);
    expect(changePct(new Decimal('26'), new Decimal('20'))).toBe(30);
  });

  it('computes a negative % decrease', () => {
    expect(changePct(new Decimal('10'), new Decimal('20'))).toBe(-50);
  });

  it('returns 0 when current equals previous', () => {
    expect(changePct(new Decimal('15'), new Decimal('15'))).toBe(0);
  });

  it('returns null when the previous period has no positive baseline (zero or negative)', () => {
    expect(changePct(new Decimal('15'), new Decimal('0'))).toBeNull();
    expect(changePct(new Decimal('0'), new Decimal('0'))).toBeNull();
  });
});
