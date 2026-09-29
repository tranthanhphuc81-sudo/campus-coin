/**
 * index.ts (integrations/ai)
 * Lazy singleton AI provider selection: empty `AI_API_KEY` or the test environment always uses
 * {@link NullProvider} (tiers 1-2 only, no network calls in tests); otherwise `config.ai.provider`
 * selects Gemini or OpenAI. Every real provider is wrapped in {@link ResilientProvider}
 * (circuit-breaker). Re-exports the public integration surface so callers only need this module.
 * Main exports: getAiProvider, _setAiProviderForTests, AiProvider, CategorizeRequest,
 *   CategorizeResultItem, InsightStats, InsightText, sanitize, AiProviderError, PROMPT_VERSION
 * Spec: docs/spec/03 §3.2 (provider-agnostic AiAdapter) · docs/spec/05b (AI categorization)
 *   · docs/spec/09 §9.12 (Table 58 – ai.provider.error audit event)
 */
import { config } from '../../config/env.js';
import { record } from '../../modules/audit/audit.service.js';
import { GeminiProvider } from './providers/gemini.provider.js';
import { NullProvider } from './providers/null.provider.js';
import { OpenAiProvider } from './providers/openai.provider.js';
import { ResilientProvider, type AiProviderErrorInfo } from './resilient.provider.js';
import type { AiProvider } from './types.js';

export type { AiProvider, CategorizeItem, CategorizeRequest, CategorizeResultItem, InsightStats, InsightText } from './types.js';
export { AiProviderError } from './errors.js';
export type { AiProviderErrorKind } from './errors.js';
export { sanitize } from './sanitize.js';
export { PROMPT_VERSION } from './prompts/categorize.v1.js';

/** Builds the real (unwrapped) provider selected by `config.ai.provider`. */
function buildRealProvider(): AiProvider {
  const options = { apiKey: config.ai.apiKey, model: config.ai.model, timeoutMs: config.ai.timeoutMs };
  return config.ai.provider === 'openai' ? new OpenAiProvider(options) : new GeminiProvider(options);
}

/**
 * Fire-and-forget `ai.provider.error` audit row (Table 58) — never awaited, `record()` itself
 * never throws (it catches and logs internally), so this can never affect the AI call path.
 */
function auditAiProviderError(info: AiProviderErrorInfo): void {
  void record({
    action: 'ai.provider.error',
    actorRole: 'system',
    metadata: { provider: info.provider, kind: info.kind, status: info.status, capability: info.capability },
  });
}

// Cache on globalThis so `tsx watch` reloads do not lose circuit-breaker state on every restart.
const globalForAi = globalThis as unknown as { __campuscoinAiProvider?: AiProvider };

/**
 * Process-wide {@link AiProvider} singleton, computed on first use. Uses {@link NullProvider}
 * (tier 3 disabled) whenever `AI_API_KEY` is empty or `NODE_ENV=test` — the test suite must never
 * make a real network call, and empty-key deployments must fully work with tiers 1-2 only.
 */
export function getAiProvider(): AiProvider {
  if (!globalForAi.__campuscoinAiProvider) {
    const useNull = config.app.isTest || config.ai.apiKey === '';
    const inner = useNull ? new NullProvider() : buildRealProvider();
    globalForAi.__campuscoinAiProvider = new ResilientProvider(inner, undefined, auditAiProviderError);
  }
  return globalForAi.__campuscoinAiProvider;
}

/**
 * Test-only: injects a provider (e.g. a spy) for the rest of the process, re-wrapped in a fresh
 * {@link ResilientProvider}/circuit breaker. Passing `null` resets to the normal lazy selection.
 * @param inner - Replacement provider, or `null` to reset.
 */
export function _setAiProviderForTests(inner: AiProvider | null): void {
  globalForAi.__campuscoinAiProvider = inner ? new ResilientProvider(inner, undefined, auditAiProviderError) : undefined;
}
