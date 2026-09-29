/**
 * resilient.provider.ts
 * Wraps any {@link AiProvider} with a {@link CircuitBreaker} so a run of provider failures stops
 * hammering it — every real provider constructed by `index.ts` is wrapped in this. Only genuine
 * transport-level failures (timeout/network/upstream/rate_limited/auth) count toward the breaker's
 * threshold; `invalid_output` (M2 review fix — a crafted description can trigger a malformed LLM
 * reply) is recorded as neutral instead, so one user's crafted input can never trip the breaker for
 * everyone. Failures are logged with only fixed, non-sensitive fields (never the raw error object,
 * prompt, descriptions or response content — docs/spec/09 §9.9).
 * Main exports: ResilientProvider, AiProviderErrorInfo
 * Spec: docs/spec/05b (AI adapter resilience) · docs/spec/10 §10.5 (graceful degradation)
 *   · docs/spec/09 §9.12 (Table 58 – ai.provider.error audit event)
 */
import { logger } from '../../lib/logger.js';
import { CircuitBreaker } from './circuitBreaker.js';
import { AiProviderError, type AiProviderErrorKind } from './errors.js';
import { PROMPT_VERSION } from './prompts/categorize.v1.js';
import { PROMPT_VERSION as INSIGHT_PROMPT_VERSION } from './prompts/insight.v1.js';
import type { AiProvider, CategorizeRequest, CategorizeResultItem, InsightStats, InsightText } from './types.js';

/** Fixed, non-sensitive info passed to the {@link ResilientProvider} `onError` hook. */
export interface AiProviderErrorInfo {
  provider: string;
  kind: AiProviderErrorKind;
  status?: number;
  capability: 'categorize' | 'writeInsight';
}

/** Decorates an inner {@link AiProvider} with circuit-breaker protection. */
export class ResilientProvider implements AiProvider {
  readonly name: string;
  readonly enabled: boolean;
  private readonly inner: AiProvider;
  private readonly breaker: CircuitBreaker;
  private readonly onError?: (info: AiProviderErrorInfo) => void;

  /**
   * @param inner - The real (or test-stub) provider being wrapped.
   * @param breaker - Circuit breaker instance (defaults to a fresh one; tests inject their own clock).
   * @param onError - Optional hook called (never awaited, never allowed to throw into the AI call
   *   path) on every provider failure — `integrations/ai/index.ts` wires this to a fire-and-forget
   *   `ai.provider.error` audit row (Table 58).
   */
  constructor(inner: AiProvider, breaker: CircuitBreaker = new CircuitBreaker(), onError?: (info: AiProviderErrorInfo) => void) {
    this.inner = inner;
    this.breaker = breaker;
    this.onError = onError;
    this.name = inner.name;
    this.enabled = inner.enabled;
  }

  /** Calls `onError` defensively: a throwing/misbehaving hook must never affect the real AI call path. */
  private notifyError(info: AiProviderErrorInfo): void {
    try {
      this.onError?.(info);
    } catch (hookErr) {
      logger.warn({ err: hookErr }, '[ai] onError hook threw; ignoring');
    }
  }

  async categorize(req: CategorizeRequest): Promise<CategorizeResultItem[]> {
    if (!this.breaker.canRequest()) throw new AiProviderError('circuit_open');

    const startedAt = Date.now();
    try {
      const result = await this.inner.categorize(req);
      this.breaker.recordSuccess();
      return result;
    } catch (err) {
      const kind = err instanceof AiProviderError ? err.kind : 'network';
      // M2 review fix: only a genuine transport-level failure counts toward the breaker's failure
      // threshold. `invalid_output` (a malformed/off-schema LLM reply — a crafted description can
      // trigger this) and `circuit_open` (not a real call at all) must NOT count, or one user's
      // crafted input could open the process-wide breaker and DoS every other user's tier-3
      // suggestions. Either way, clear any in-flight half-open trial so the slot isn't stuck.
      if (kind === 'invalid_output' || kind === 'circuit_open') {
        this.breaker.recordNeutral();
      } else {
        this.breaker.recordFailure();
      }
      const status = err instanceof AiProviderError ? err.status : undefined;
      // Never log `err` itself, the prompt, descriptions, or response content — only fixed fields.
      logger.warn(
        { event: 'ai.provider.error', provider: this.name, kind, status, durationMs: Date.now() - startedAt, promptVersion: PROMPT_VERSION },
        'ai.provider.error',
      );
      this.notifyError({ provider: this.name, kind, status, capability: 'categorize' });
      throw err instanceof AiProviderError ? err : new AiProviderError('network');
    }
  }

  /**
   * Same breaker-wrapped pattern as {@link categorize} — one breaker per provider/process, shared
   * across both capabilities (they hit the same transport/budget). `invalid_output` and
   * `circuit_open` are recorded as neutral so a crafted/edge-case reply can never trip the
   * process-wide breaker for other users.
   */
  async writeInsight(stats: InsightStats): Promise<InsightText | null> {
    if (!this.breaker.canRequest()) throw new AiProviderError('circuit_open');

    const startedAt = Date.now();
    try {
      const result = await this.inner.writeInsight(stats);
      this.breaker.recordSuccess();
      return result;
    } catch (err) {
      const kind = err instanceof AiProviderError ? err.kind : 'network';
      if (kind === 'invalid_output' || kind === 'circuit_open') {
        this.breaker.recordNeutral();
      } else {
        this.breaker.recordFailure();
      }
      logger.warn(
        { event: 'ai.provider.error', provider: this.name, kind, durationMs: Date.now() - startedAt, promptVersion: INSIGHT_PROMPT_VERSION },
        'ai.provider.error',
      );
      const status = err instanceof AiProviderError ? err.status : undefined;
      this.notifyError({ provider: this.name, kind, status, capability: 'writeInsight' });
      throw err instanceof AiProviderError ? err : new AiProviderError('network');
    }
  }
}
