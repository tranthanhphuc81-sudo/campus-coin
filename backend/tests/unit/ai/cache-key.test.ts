/**
 * cache-key.test.ts
 * Unit test for the tier-3 (LLM) cache key fix (P10 security review, High finding): the key MUST
 * be derived from `sanitize(description)` — the EXACT text the LLM saw — never from
 * `normalizeMerchantKey(description)`, which throws away digits/full-width characters/non-Latin
 * scripts and could previously let two different descriptions collide on the same cache entry.
 * Spec: docs/spec/09 §9.9 (LLM data minimisation) · docs/spec/10 §10.3 (cache strategy)
 */
import { describe, expect, it } from 'vitest';
import { aiCategoryCacheKey } from '../../../src/lib/cacheKeys.js';
import { sanitize } from '../../../src/integrations/ai/sanitize.js';
import { normalizeMerchantKey } from '../../../src/lib/merchantKey.js';

describe('aiCategoryCacheKey (High review fix: keyed on sanitize(description), not merchantKey)', () => {
  const listVersion = 'promptversion-expense-food-transport';

  it('two descriptions that collapse to the SAME merchant key (root cause) produce DIFFERENT cache keys', () => {
    const withHiddenDigits = 'Kafe Moc 123456';
    const clean = 'Kafe Moc';

    // Confirms the root cause still exists in normalizeMerchantKey itself (digits stripped) — this
    // is exactly why the OLD merchant-key-based cache key was unsafe.
    expect(normalizeMerchantKey(withHiddenDigits)).toBe(normalizeMerchantKey(clean));

    const keyA = aiCategoryCacheKey(sanitize(withHiddenDigits), listVersion);
    const keyB = aiCategoryCacheKey(sanitize(clean), listVersion);
    expect(keyA).not.toBe(keyB);
  });

  it('two descriptions differing only by a full-width/non-Latin suffix produce DIFFERENT cache keys', () => {
    const withFullWidth = 'Kafe Moc ＩＧＮＯＲＥ';
    const clean = 'Kafe Moc';

    expect(normalizeMerchantKey(withFullWidth)).toBe(normalizeMerchantKey(clean));

    const keyA = aiCategoryCacheKey(sanitize(withFullWidth), listVersion);
    const keyB = aiCategoryCacheKey(sanitize(clean), listVersion);
    expect(keyA).not.toBe(keyB);
  });

  it('the SAME sanitized text + list version always produces the SAME cache key (deterministic, cache still works)', () => {
    const keyA = aiCategoryCacheKey(sanitize('Campus Cafe'), listVersion);
    const keyB = aiCategoryCacheKey(sanitize('Campus Cafe'), listVersion);
    expect(keyA).toBe(keyB);
  });
});
