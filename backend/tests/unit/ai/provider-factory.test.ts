/**
 * provider-factory.test.ts
 * Unit tests for `getAiProvider()`/`_setAiProviderForTests()` (backend/src/integrations/ai/
 * index.ts): empty API key -> NullProvider, always NullProvider in the test environment (even
 * with a key configured), and an injected test provider gets wrapped in resilience.
 * Spec: docs/spec/03 §3.2 (works fully with AI_API_KEY empty)
 */
import { afterEach, describe, expect, it } from 'vitest';
import { _setAiProviderForTests, getAiProvider } from '../../../src/integrations/ai/index.js';
import type { AiProvider, CategorizeResultItem } from '../../../src/integrations/ai/types.js';

afterEach(() => {
  _setAiProviderForTests(null);
});

describe('getAiProvider', () => {
  it('returns a disabled provider (NullProvider) when AI_API_KEY is empty / running in tests', () => {
    const provider = getAiProvider();
    expect(provider.enabled).toBe(false);
    expect(provider.name).toBe('null');
  });

  it('memoizes the same instance across calls', () => {
    expect(getAiProvider()).toBe(getAiProvider());
  });

  it('wraps an injected test provider with resilience (still callable, exposes its name/enabled)', async () => {
    const spy: AiProvider = {
      name: 'spy',
      enabled: true,
      categorize: async (): Promise<CategorizeResultItem[]> => [{ index: 0, category: 'Food', confidence: 0.5 }],
      writeInsight: async () => null,
    };
    _setAiProviderForTests(spy);

    const provider = getAiProvider();
    expect(provider.name).toBe('spy');
    expect(provider.enabled).toBe(true);
    const result = await provider.categorize({ type: 'expense', categories: ['Food'], items: [{ index: 0, text: 'x' }] });
    expect(result).toEqual([{ index: 0, category: 'Food', confidence: 0.5 }]);
  });

  it('resets back to the normal lazy (Null) provider when passed null', () => {
    _setAiProviderForTests({ name: 'spy', enabled: true, categorize: async () => [], writeInsight: async () => null });
    _setAiProviderForTests(null);
    expect(getAiProvider().name).toBe('null');
  });
});
