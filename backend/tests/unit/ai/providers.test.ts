/**
 * providers.test.ts
 * Unit tests for the Gemini/OpenAI providers (backend/src/integrations/ai/providers/*) and the
 * resilient wrapper's logging, using `vi.stubGlobal('fetch')` so no real network call is made.
 * Spec: docs/spec/05b (AI categorization, tier 3) · docs/spec/09 §9.9 (never log the API key/PII)
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AI_CIRCUIT_FAILURE_THRESHOLD, AI_CIRCUIT_OPEN_MS } from '@campuscoin/shared';
import { CircuitBreaker } from '../../../src/integrations/ai/circuitBreaker.js';
import { AiProviderError } from '../../../src/integrations/ai/errors.js';
import { GeminiProvider } from '../../../src/integrations/ai/providers/gemini.provider.js';
import { OpenAiProvider } from '../../../src/integrations/ai/providers/openai.provider.js';
import { ResilientProvider } from '../../../src/integrations/ai/resilient.provider.js';
import { logger } from '../../../src/lib/logger.js';
import type { AiProvider, CategorizeRequest } from '../../../src/integrations/ai/types.js';

const baseRequest: CategorizeRequest = {
  type: 'expense',
  categories: ['Food', 'Transport'],
  items: [{ index: 0, text: 'Campus Cafe, contact jane@example.com' }],
};

function geminiEnvelope(json: unknown): unknown {
  return { candidates: [{ content: { parts: [{ text: JSON.stringify(json) }] } }] };
}

function openAiEnvelope(json: unknown): unknown {
  return { choices: [{ message: { content: JSON.stringify(json) } }] };
}

/**
 * A fetch mock that hangs forever, then rejects with the request's OWN `AbortSignal`'s real
 * `reason` once it fires — NOT a hand-rolled `DOMException`. This matters for the L1 review fix:
 * on Node 24, `AbortSignal.timeout()`'s native reason is a DOMException named "TimeoutError", not
 * "AbortError" (only a manually-called `AbortController.abort()` produces "AbortError") — using
 * the signal's real reason here is what actually exercises that distinction, instead of just
 * asserting on a fabricated error name that happened to match the (buggy) old code.
 */
function hangingFetchMock() {
  return vi.fn((_url: string, init: RequestInit) => {
    return new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(init.signal!.reason as Error));
    });
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('GeminiProvider', () => {
  it('sends the API key in the x-goog-api-key header, never in the URL', async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).not.toContain('super-secret-key');
      expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('super-secret-key');
      return new Response(JSON.stringify(geminiEnvelope({ results: [{ index: 0, category: 'Food', confidence: 0.8 }] })), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new GeminiProvider({ apiKey: 'super-secret-key', model: 'gemini-flash-latest', timeoutMs: 3000 });
    const result = await provider.categorize(baseRequest);
    expect(result).toEqual([{ index: 0, category: 'Food', confidence: 0.8 }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends the sanitized text, not the raw description', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as { contents: Array<{ parts: Array<{ text: string }> }> };
      const userText = body.contents[0]!.parts[0]!.text;
      expect(userText).not.toContain('jane@example.com');
      expect(userText).toContain('[email]');
      return new Response(JSON.stringify(geminiEnvelope({ results: [] })), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new GeminiProvider({ apiKey: 'key', model: 'gemini-flash-latest', timeoutMs: 3000 });
    await provider.categorize(baseRequest);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('maps a hanging call past its timeout to AiProviderError(timeout) (L1 review: real AbortSignal.timeout() reason, name "TimeoutError")', async () => {
    // Sanity-check Node's own behaviour so this test can't silently pass for the wrong reason if a
    // future Node version changes it back to "AbortError" (no network call — just a 1ms timer).
    const probeSignal = AbortSignal.timeout(1);
    await new Promise((resolve) => probeSignal.addEventListener('abort', resolve));
    expect(probeSignal.reason).toBeInstanceOf(DOMException);
    expect((probeSignal.reason as DOMException).name).toBe('TimeoutError');

    vi.stubGlobal('fetch', hangingFetchMock());
    const provider = new GeminiProvider({ apiKey: 'key', model: 'gemini-flash-latest', timeoutMs: 3000 });

    await expect(provider.categorize({ ...baseRequest, timeoutMs: 50 })).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('maps a 401 response to AiProviderError(auth)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('unauthorized', { status: 401 })),
    );
    const provider = new GeminiProvider({ apiKey: 'bad-key', model: 'gemini-flash-latest', timeoutMs: 3000 });

    await expect(provider.categorize(baseRequest)).rejects.toBeInstanceOf(AiProviderError);
    await expect(provider.categorize(baseRequest)).rejects.toMatchObject({ kind: 'auth' });
  });
});

describe('JsonLlmProvider category-name sanitisation (L2 review fix)', () => {
  it('sanitises a PII-bearing category name in the outbound request, and still resolves the reply back to the ORIGINAL category name', async () => {
    const categories = ['Food', 'Loan to Minh 0912345678'];
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as { contents: Array<{ parts: Array<{ text: string }> }> };
      const userText = body.contents[0]!.parts[0]!.text;
      // The raw phone number never leaves the process, even inside a category name.
      expect(userText).not.toContain('0912345678');
      expect(userText).toContain('Loan to Minh [phone]');
      // The model can only ever be asked to answer with the SANITISED name.
      return new Response(
        JSON.stringify(geminiEnvelope({ results: [{ index: 0, category: 'Loan to Minh [phone]', confidence: 0.9 }] })),
        { status: 200 },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new GeminiProvider({ apiKey: 'key', model: 'gemini-flash-latest', timeoutMs: 3000 });
    const result = await provider.categorize({ type: 'expense', categories, items: [{ index: 0, text: 'Repayment' }] });

    // Resolved back to the ORIGINAL (unsanitised) category name the caller knows about.
    expect(result).toEqual([{ index: 0, category: 'Loan to Minh 0912345678', confidence: 0.9 }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('OpenAiProvider', () => {
  it('sends Authorization: Bearer <key>', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      expect((init.headers as Record<string, string>).authorization).toBe('Bearer super-secret-key');
      return new Response(JSON.stringify(openAiEnvelope({ results: [{ index: 0, category: 'Food', confidence: 0.8 }] })), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new OpenAiProvider({ apiKey: 'super-secret-key', model: 'gpt-test', timeoutMs: 3000 });
    const result = await provider.categorize(baseRequest);
    expect(result).toEqual([{ index: 0, category: 'Food', confidence: 0.8 }]);
  });
});

describe('ResilientProvider logging', () => {
  it('never includes the description text in a logged provider-error line', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 })),
    );
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger);

    const inner = new GeminiProvider({ apiKey: 'super-secret-key', model: 'gemini-flash-latest', timeoutMs: 3000 });
    const resilient = new ResilientProvider(inner);

    await expect(resilient.categorize(baseRequest)).rejects.toBeInstanceOf(AiProviderError);

    expect(warnSpy).toHaveBeenCalled();
    const serialized = JSON.stringify(warnSpy.mock.calls);
    expect(serialized).not.toContain('jane@example.com');
    expect(serialized).not.toContain('Campus Cafe');
    expect(serialized).not.toContain('super-secret-key');
  });
});

describe('ResilientProvider onError hook (P16)', () => {
  /** A minimal {@link AiProvider} whose `categorize`/`writeInsight` always run the given implementations. */
  function stubProvider(overrides: Partial<AiProvider> = {}): AiProvider {
    return {
      name: 'stub',
      enabled: true,
      categorize: async () => {
        throw new AiProviderError('network', 503);
      },
      writeInsight: async () => {
        throw new AiProviderError('timeout');
      },
      ...overrides,
    };
  }

  it('fires on a categorize failure with provider/kind/status/capability, and never throws into the call path', async () => {
    const onError = vi.fn();
    const resilient = new ResilientProvider(stubProvider(), undefined, onError);

    await expect(resilient.categorize(baseRequest)).rejects.toMatchObject({ kind: 'network' });

    expect(onError).toHaveBeenCalledWith({ provider: 'stub', kind: 'network', status: 503, capability: 'categorize' });
  });

  it('fires on a writeInsight failure with capability "writeInsight"', async () => {
    const onError = vi.fn();
    const resilient = new ResilientProvider(stubProvider(), undefined, onError);
    const stats = { month: '2026-09', currency: 'USD', totalIncome: '0', totalExpense: '0', categories: [] } as never;

    await expect(resilient.writeInsight(stats)).rejects.toMatchObject({ kind: 'timeout' });

    expect(onError).toHaveBeenCalledWith({ provider: 'stub', kind: 'timeout', status: undefined, capability: 'writeInsight' });
  });

  it('a throwing onError hook never breaks the real AI call path (still rejects with the real AiProviderError)', async () => {
    const onError = vi.fn(() => {
      throw new Error('boom');
    });
    const resilient = new ResilientProvider(stubProvider(), undefined, onError);

    await expect(resilient.categorize(baseRequest)).rejects.toBeInstanceOf(AiProviderError);
    expect(onError).toHaveBeenCalled();
  });
});

describe('ResilientProvider circuit breaker (M2 review fix)', () => {
  /** A minimal {@link AiProvider} whose `categorize` always runs the given implementation. */
  function stubProvider(categorize: AiProvider['categorize']): AiProvider {
    return { name: 'stub', enabled: true, categorize, writeInsight: async () => null };
  }

  it('5 consecutive invalid_output results do NOT open the breaker (one crafted request cannot DoS every other user)', async () => {
    const breaker = new CircuitBreaker();
    const inner = stubProvider(async () => {
      throw new AiProviderError('invalid_output');
    });
    const resilient = new ResilientProvider(inner, breaker);

    for (let i = 0; i < 5; i++) {
      await expect(resilient.categorize(baseRequest)).rejects.toMatchObject({ kind: 'invalid_output' });
    }

    expect(breaker.state).toBe('closed');
    expect(breaker.canRequest()).toBe(true);
  });

  it('a transport failure during a half-open trial still fails the breaker back open', async () => {
    let now = 0;
    const breaker = new CircuitBreaker(() => now);
    for (let i = 0; i < AI_CIRCUIT_FAILURE_THRESHOLD; i++) breaker.recordFailure();
    now += AI_CIRCUIT_OPEN_MS;
    expect(breaker.state).toBe('half_open');

    const inner = stubProvider(async () => {
      throw new AiProviderError('network');
    });
    const resilient = new ResilientProvider(inner, breaker);
    await expect(resilient.categorize(baseRequest)).rejects.toMatchObject({ kind: 'network' });

    expect(breaker.state).toBe('open');
    expect(breaker.canRequest()).toBe(false);
  });

  it('an invalid_output during a half-open trial clears the trial without opening or closing the breaker', async () => {
    let now = 0;
    const breaker = new CircuitBreaker(() => now);
    for (let i = 0; i < AI_CIRCUIT_FAILURE_THRESHOLD; i++) breaker.recordFailure();
    now += AI_CIRCUIT_OPEN_MS;
    expect(breaker.state).toBe('half_open');

    const inner = stubProvider(async () => {
      throw new AiProviderError('invalid_output');
    });
    const resilient = new ResilientProvider(inner, breaker);
    await expect(resilient.categorize(baseRequest)).rejects.toMatchObject({ kind: 'invalid_output' });

    // Neither opened (still half-open, same clock) nor closed (a fresh trial call is allowed again).
    expect(breaker.state).toBe('half_open');
    expect(breaker.canRequest()).toBe(true);
  });
});
