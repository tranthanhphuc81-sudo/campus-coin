/**
 * http.ts
 * Minimal JSON-over-HTTPS helper for AI provider calls, built on the native `fetch` (Node 24) so
 * no extra HTTP client dependency is needed. Every failure is mapped to a fixed-message
 * {@link AiProviderError} — the response body is NEVER included in the thrown error (docs/spec/09
 * §9.9: never leak provider/request content into logs).
 * Main exports: postJson
 * Spec: docs/spec/05b (AI adapter) · docs/spec/09 §9.9 (LLM data minimisation)
 */
import { AiProviderError } from './errors.js';

/** Options accepted by {@link postJson}. */
export interface PostJsonOptions {
  headers?: Record<string, string>;
  timeoutMs: number;
}

/**
 * POSTs a JSON body and parses a JSON response, mapping every failure mode to an
 * {@link AiProviderError} with a fixed `kind` (never the raw response/error text).
 * @throws {AiProviderError} `timeout` on abort, `auth` on 401/403, `rate_limited` on 429,
 *   `upstream` on any other non-2xx, `network` on a fetch-level failure (e.g. DNS/connection),
 *   `invalid_output` when the body is not valid JSON.
 */
export async function postJson(url: string, body: unknown, options: PostJsonOptions): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...options.headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeoutMs),
    });
  } catch (err) {
    // L1 review fix: on Node 24, `AbortSignal.timeout()` rejects with a DOMException named
    // "TimeoutError", NOT "AbortError" (only a manually-aborted `AbortController` uses "AbortError")
    // — checking only "AbortError" silently mis-classified every real timeout as `network`, which
    // would have skipped the circuit breaker's dedicated timeout handling.
    if (err instanceof DOMException && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new AiProviderError('timeout');
    }
    // fetch rejects with a TypeError for network-level failures (DNS, connection refused, …).
    if (err instanceof TypeError) throw new AiProviderError('network');
    throw new AiProviderError('network');
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new AiProviderError('auth', res.status);
    if (res.status === 429) throw new AiProviderError('rate_limited', res.status);
    throw new AiProviderError('upstream', res.status);
  }

  try {
    return await res.json();
  } catch {
    throw new AiProviderError('invalid_output', res.status);
  }
}
