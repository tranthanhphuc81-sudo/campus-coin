/**
 * stats.test.ts
 * Unit tests for the decimal-safe descriptive-statistics helpers (src/lib/stats.ts).
 * Spec: docs/spec/05c §5.14 (anomaly stats) · docs/spec/12 (testing plan)
 */
import { describe, expect, it } from 'vitest';
import { median, sampleStdDev } from '../../../src/lib/stats.js';
import { toMoneyString } from '../../../src/lib/money.js';

describe('median', () => {
  it('is the value itself for a single-item list', () => {
    expect(median(['5.00']).toString()).toBe('5');
  });

  it('is the average of the two middle values for a two-item list', () => {
    expect(toMoneyString(median(['1.00', '3.00']))).toBe('2.00');
  });

  it('handles odd-length lists (true middle element)', () => {
    expect(median(['3', '1', '2']).toString()).toBe('2');
  });

  it('handles even-length lists (average of the two middle elements)', () => {
    expect(toMoneyString(median(['1', '2', '3', '4']))).toBe('2.50');
  });

  it('does not mutate the input array (sorts a copy)', () => {
    const input = ['3.00', '1.00', '2.00'];
    const snapshot = [...input];
    median(input);
    expect(input).toEqual(snapshot);
  });

  it('handles large VND-style integer values with no currency decimals', () => {
    expect(median(['500000', '100000', '300000']).toString()).toBe('300000');
  });

  it('throws RangeError on an empty list', () => {
    expect(() => median([])).toThrow(RangeError);
  });
});

describe('sampleStdDev', () => {
  it('throws RangeError for a single value (n-1 would be 0)', () => {
    expect(() => sampleStdDev(['5.00'])).toThrow(RangeError);
  });

  it('is 0 for two equal values', () => {
    expect(toMoneyString(sampleStdDev(['5.00', '5.00']))).toBe('0.00');
  });

  it('is 0 when every value is equal (any length)', () => {
    expect(toMoneyString(sampleStdDev(['10.00', '10.00', '10.00', '10.00']))).toBe('0.00');
  });

  it('computes a sample stdDev for two distinct values', () => {
    // mean=6, deviations +-2 -> sumSquares=8, /(n-1=1) = 8, sqrt(8) ~= 2.828427
    expect(sampleStdDev(['4.00', '8.00']).toFixed(4)).toBe('2.8284');
  });

  it('keeps exact decimal precision for money-style inputs (no float drift)', () => {
    // mean(10.10, 10.20, 10.30) = 10.20 exactly; a naive float mean can drift off 10.2.
    expect(toMoneyString(sampleStdDev(['10.10', '10.20', '10.30']))).toBe('0.10');
  });

  it('handles large VND-style integer values with no currency decimals', () => {
    expect(sampleStdDev(['100000', '200000', '300000']).toFixed(2)).toBe('100000.00');
  });

  it('matches a known worked series ([2,4,4,4,5,5,7,9] -> ~2.1381)', () => {
    const values = ['2', '4', '4', '4', '5', '5', '7', '9'];
    expect(sampleStdDev(values).toFixed(4)).toBe('2.1381');
  });
});
