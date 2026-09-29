/**
 * circuitBreaker.ts
 * Simple in-memory circuit breaker (per-process — the API and the worker each keep their own
 * state) protecting the app from hammering a failing AI provider. Closed -> open after
 * `AI_CIRCUIT_FAILURE_THRESHOLD` consecutive failures; open -> half-open after
 * `AI_CIRCUIT_OPEN_MS`; one trial call is allowed in half-open, its outcome decides whether the
 * breaker closes again or reopens. A non-transport outcome (e.g. a malformed LLM reply) is recorded
 * as NEUTRAL (`recordNeutral`), never a failure — see its doc comment (M2 review fix).
 * Main exports: CircuitBreaker, CircuitState
 * Spec: docs/spec/05b (AI adapter resilience) · docs/spec/10 §10.5 (graceful degradation)
 */
import { AI_CIRCUIT_FAILURE_THRESHOLD, AI_CIRCUIT_OPEN_MS } from '@campuscoin/shared';

/** Circuit breaker state machine states. */
export type CircuitState = 'closed' | 'open' | 'half_open';

/**
 * Tracks consecutive provider failures and decides whether a new call is allowed through.
 * The clock is injectable (`now`) so tests can simulate the passage of time deterministically.
 */
export class CircuitBreaker {
  private failures = 0;
  private openedAt = 0;
  private halfOpenTrialInFlight = false;
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  /** Current state, derived from the internal counters (no separate field to keep in sync). */
  get state(): CircuitState {
    if (this.failures < AI_CIRCUIT_FAILURE_THRESHOLD) return 'closed';
    const elapsed = this.now() - this.openedAt;
    return elapsed >= AI_CIRCUIT_OPEN_MS ? 'half_open' : 'open';
  }

  /**
   * Whether a new call may proceed. `open` refuses every call; `half_open` allows exactly one
   * trial call at a time (repeated calls while a trial is in flight are also refused).
   */
  canRequest(): boolean {
    const state = this.state;
    if (state === 'closed') return true;
    if (state === 'open') return false;
    // half_open: allow exactly one trial call.
    if (this.halfOpenTrialInFlight) return false;
    this.halfOpenTrialInFlight = true;
    return true;
  }

  /** Records a successful call: fully resets the breaker (closed, zero failures). */
  recordSuccess(): void {
    this.failures = 0;
    this.openedAt = 0;
    this.halfOpenTrialInFlight = false;
  }

  /** Records a failed call: increments the failure count and (re)opens the clock on threshold. */
  recordFailure(): void {
    this.halfOpenTrialInFlight = false;
    this.failures += 1;
    if (this.failures >= AI_CIRCUIT_FAILURE_THRESHOLD) {
      this.openedAt = this.now();
    }
  }

  /**
   * Records a NEUTRAL outcome (M2 review fix): clears an in-flight half-open trial slot (so it
   * isn't stuck "in flight" forever) WITHOUT touching the failure counter or the opened-at clock —
   * unlike {@link recordFailure}, this never opens or re-opens the breaker, and unlike
   * {@link recordSuccess} it never resets an already-accumulated failure count either. Used by
   * `ResilientProvider` for outcomes that are not a transport-level failure of the PROVIDER itself
   * (e.g. `invalid_output` — a crafted/off-schema reply one attacker-controlled request can trigger,
   * which must not let a single user DoS every other user's tier-3 suggestions for the process).
   */
  recordNeutral(): void {
    this.halfOpenTrialInFlight = false;
  }
}
