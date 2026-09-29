/**
 * errors.ts
 * Error type thrown by every AI provider call. `message` must NEVER contain request/response
 * content (prompt text, descriptions, API responses) — only a fixed, generic description of the
 * failure kind (docs/spec/09 §9.9: never leak PII/user data into logs via an error).
 * Main exports: AiProviderError, AiProviderErrorKind
 * Spec: docs/spec/05b (AI categorization) · docs/spec/09 §9.9 (LLM data minimisation)
 */

/** Machine-readable classification of an AI provider failure. */
export type AiProviderErrorKind = 'timeout' | 'auth' | 'rate_limited' | 'upstream' | 'invalid_output' | 'circuit_open' | 'network';

/**
 * Thrown by {@link import('./http.js').postJson} and every provider/wrapper. Callers (the AI
 * service) always treat this as "no suggestion available" and fall back gracefully — an AI
 * failure must never block saving a transaction.
 */
export class AiProviderError extends Error {
  readonly kind: AiProviderErrorKind;
  readonly status?: number;

  constructor(kind: AiProviderErrorKind, status?: number) {
    super(`AI provider error: ${kind}`);
    this.name = 'AiProviderError';
    this.kind = kind;
    this.status = status;
  }
}
