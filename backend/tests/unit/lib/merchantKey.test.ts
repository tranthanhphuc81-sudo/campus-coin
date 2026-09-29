/**
 * merchantKey.test.ts
 * Unit tests for merchant-key normalisation (src/lib/merchantKey.ts).
 * Spec: docs/spec/05a §5.4 (transactions)
 */
import { describe, expect, it } from 'vitest';
import { normalizeMerchantKey } from '../../../src/lib/merchantKey.js';

describe('normalizeMerchantKey', () => {
  it('strips punctuation/digits and lower-cases', () => {
    expect(normalizeMerchantKey('Campus Café #12')).toBe('campus cafe');
  });

  it('folds đ/Đ and strips Vietnamese diacritics, dropping stop-words', () => {
    expect(normalizeMerchantKey('Cơm tấm tại Đà Nẵng')).toBe('com tam da nang');
  });

  it('drops English stop-words', () => {
    expect(normalizeMerchantKey('The Coffee House')).toBe('coffee house');
  });

  it('returns null when nothing meaningful is left', () => {
    expect(normalizeMerchantKey('123 !!!')).toBeNull();
  });

  it('returns null for null/undefined/empty input', () => {
    expect(normalizeMerchantKey(null)).toBeNull();
    expect(normalizeMerchantKey(undefined)).toBeNull();
    expect(normalizeMerchantKey('')).toBeNull();
    expect(normalizeMerchantKey('   ')).toBeNull();
  });

  it('truncates a very long result to the max length', () => {
    const long = 'a'.repeat(300);
    const result = normalizeMerchantKey(long);
    expect(result).not.toBeNull();
    expect(result!.length).toBeLessThanOrEqual(100);
  });
});
