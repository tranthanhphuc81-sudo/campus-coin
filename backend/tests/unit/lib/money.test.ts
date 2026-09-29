/**
 * money.test.ts
 * Unit tests for the decimal-safe money helpers (src/lib/money.ts).
 * Spec: docs/spec/06 §6.1 (money) · docs/spec/12 (testing plan)
 */
import { describe, expect, it } from 'vitest';
import {
  Decimal,
  add,
  compare,
  formatMoney,
  isPositive,
  percentOf,
  sub,
  sum,
  toMoney,
  toMoneyString,
} from '../../../src/lib/money.js';

describe('toMoney', () => {
  it('parses plain decimal strings and Decimals', () => {
    expect(toMoney('12.5').toString()).toBe('12.5');
    expect(toMoney(' 3 ').toString()).toBe('3');
    expect(toMoney(new Decimal('1.10')).equals('1.1')).toBe(true);
  });

  it.each(['', 'abc', '1e3', '1,5', '12.', '.5', 'NaN', 'Infinity'])('rejects "%s"', (value) => {
    expect(() => toMoney(value)).toThrow(TypeError);
  });
});

describe('arithmetic', () => {
  it('adds without float errors (0.1 + 0.2 = 0.30)', () => {
    expect(toMoneyString(add('0.1', '0.2'))).toBe('0.30');
  });

  it('subtracts and can go negative', () => {
    expect(toMoneyString(sub('10.00', '12.35'))).toBe('-2.35');
  });

  it('sums a list and returns 0 for an empty list', () => {
    expect(toMoneyString(sum(['1.10', '2.20', new Decimal('3.30')]))).toBe('6.60');
    expect(toMoneyString(sum([]))).toBe('0.00');
  });

  it('keeps precision at the Decimal(14,2) maximum', () => {
    expect(toMoneyString(add('999999999999.98', '0.01'))).toBe('999999999999.99');
  });
});

describe('compare / isPositive', () => {
  it('compares values', () => {
    expect(compare('1.00', '1')).toBe(0);
    expect(compare('1.01', '1')).toBe(1);
    expect(compare('0.99', '1')).toBe(-1);
  });

  it('isPositive is strict (BR-TX-01)', () => {
    expect(isPositive('0.01')).toBe(true);
    expect(isPositive('0')).toBe(false);
    expect(isPositive('-5')).toBe(false);
  });
});

describe('toMoneyString', () => {
  it('pads to 2 decimals and rounds half-up', () => {
    expect(toMoneyString('12.5')).toBe('12.50');
    expect(toMoneyString('1.005')).toBe('1.01');
    expect(toMoneyString('1.004')).toBe('1.00');
  });

  it('supports another scale', () => {
    expect(toMoneyString('1234.5', 0)).toBe('1235');
  });
});

describe('percentOf', () => {
  it('computes a rounded whole percent', () => {
    expect(percentOf('26', '30')).toBe(87);
    expect(percentOf('30', '30')).toBe(100);
    expect(percentOf('36', '30')).toBe(120);
  });

  it('guards division by zero — a non-positive denominator returns 0', () => {
    expect(percentOf('10', '0')).toBe(0);
    expect(percentOf('10', '-5')).toBe(0);
  });

  it('rounds half-up', () => {
    expect(percentOf('23.9', '30')).toBe(80); // 79.66... -> 80
  });
});

describe('formatMoney', () => {
  it('formats USD with 2 decimals by default', () => {
    expect(formatMoney('1234.5')).toBe('$1,234.50');
  });

  it('formats VND with 0 decimals', () => {
    expect(formatMoney('1234.5', 'VND')).toBe('₫1,235');
  });

  it('keeps large values exact (no float rounding)', () => {
    expect(formatMoney('999999999999.99')).toBe('$999,999,999,999.99');
  });
});
