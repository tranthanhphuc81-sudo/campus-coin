/**
 * forecast.test.ts
 * Unit tests for the pure next-month WMA forecast (src/lib/forecast.ts).
 * Spec: docs/spec/05c §5.14 · docs/spec/12 (testing plan)
 */
import { describe, expect, it } from 'vitest';
import { forecastSeries } from '../../../src/lib/forecast.js';
import { toMoneyString } from '../../../src/lib/money.js';

describe('forecastSeries', () => {
  it('computes a hand-verified WMA/forecast with 3 full months', () => {
    // monthly = [M-3, M-2, M-1] = [100, 200, 300]; weights 0.5*M-1 + 0.3*M-2 + 0.2*M-3
    // = 0.5*300 + 0.3*200 + 0.2*100 = 150 + 60 + 20 = 230.
    const result = forecastSeries({ monthly: ['100', '200', '300'], recurring: '0' });
    expect(result).not.toBeNull();
    expect(toMoneyString(result!.wma)).toBe('230.00');
    expect(toMoneyString(result!.forecast)).toBe('230.00');
  });

  it('adds the known recurring amount on top of the WMA', () => {
    const result = forecastSeries({ monthly: ['100', '200', '300'], recurring: '50' });
    expect(toMoneyString(result!.forecast)).toBe('280.00');
  });

  it('renormalises weights when exactly 2 of 3 months are present', () => {
    // Only M-2 (200) and M-1 (300) present; M-3 missing. Effective weights: 0.5/0.8, 0.3/0.8.
    // wma = 300*(0.5/0.8) + 200*(0.3/0.8) = 187.5 + 75 = 262.5
    const result = forecastSeries({ monthly: [null, '200', '300'], recurring: '0' });
    expect(result).not.toBeNull();
    expect(toMoneyString(result!.wma)).toBe('262.50');
  });

  it('returns null when only 1 month is present (insufficient data)', () => {
    expect(forecastSeries({ monthly: [null, null, '300'], recurring: '0' })).toBeNull();
  });

  it('returns null when all 3 months are missing', () => {
    expect(forecastSeries({ monthly: [null, null, null], recurring: '0' })).toBeNull();
  });

  it('treats a genuinely-zero month as available data, distinct from a missing month', () => {
    // [0, 5, 10] -> all 3 available, computes normally (not the insufficient-data path).
    const zeroCase = forecastSeries({ monthly: ['0', '5', '10'], recurring: '0' });
    expect(zeroCase).not.toBeNull();
    // wma = 10*0.5 + 5*0.3 + 0*0.2 = 5 + 1.5 + 0 = 6.5
    expect(toMoneyString(zeroCase!.wma)).toBe('6.50');

    // [null, 5, 10] -> only 2 available, still enough data, but a different (renormalised) wma.
    const missingCase = forecastSeries({ monthly: [null, '5', '10'], recurring: '0' });
    expect(missingCase).not.toBeNull();
    // effective weights 0.5/0.8, 0.3/0.8: wma = 10*(0.5/0.8) + 5*(0.3/0.8) = 6.25 + 1.875 = 8.125
    expect(toMoneyString(missingCase!.wma)).toBe('8.13');
  });

  it('recurring-only case: all months are 0, recurring drives the forecast, stdDev is 0', () => {
    const result = forecastSeries({ monthly: ['0', '0', '0'], recurring: '50' });
    expect(result).not.toBeNull();
    expect(toMoneyString(result!.forecast)).toBe('50.00');
    expect(toMoneyString(result!.stdDev)).toBe('0.00');
    expect(toMoneyString(result!.lower)).toBe('50.00');
    expect(toMoneyString(result!.upper)).toBe('50.00');
  });

  it('clamps lower to 0 when the forecast is smaller than the stdDev', () => {
    // monthly values with high variance and a small resulting forecast.
    const result = forecastSeries({ monthly: ['1', '0', '0'], recurring: '0' });
    expect(result).not.toBeNull();
    // forecast = 0*0.5 + 0*0.3 + 1*0.2 = 0.2; stdDev of [1,0,0] (sample) is > 0.2 -> lower clamps to 0.
    expect(result!.forecast.lessThan(result!.stdDev)).toBe(true);
    expect(toMoneyString(result!.lower)).toBe('0.00');
  });
});
