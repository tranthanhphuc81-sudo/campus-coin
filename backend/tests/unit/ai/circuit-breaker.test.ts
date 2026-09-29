/**
 * circuit-breaker.test.ts
 * Unit tests for `CircuitBreaker` (backend/src/integrations/ai/circuitBreaker.ts): closed -> open
 * after AI_CIRCUIT_FAILURE_THRESHOLD consecutive failures, open refuses calls, half-open trial
 * after AI_CIRCUIT_OPEN_MS with both outcomes.
 * Spec: docs/spec/05b (AI adapter resilience)
 */
import { AI_CIRCUIT_FAILURE_THRESHOLD, AI_CIRCUIT_OPEN_MS } from '@campuscoin/shared';
import { describe, expect, it } from 'vitest';
import { CircuitBreaker } from '../../../src/integrations/ai/circuitBreaker.js';

describe('CircuitBreaker', () => {
  it('starts closed and allows requests', () => {
    const breaker = new CircuitBreaker();
    expect(breaker.state).toBe('closed');
    expect(breaker.canRequest()).toBe(true);
  });

  it(`opens after ${AI_CIRCUIT_FAILURE_THRESHOLD} consecutive failures`, () => {
    const now = 0;
    const breaker = new CircuitBreaker(() => now);
    for (let i = 0; i < AI_CIRCUIT_FAILURE_THRESHOLD; i++) breaker.recordFailure();
    expect(breaker.state).toBe('open');
  });

  it('refuses the next call once open, without needing to call the inner provider', () => {
    const now = 0;
    const breaker = new CircuitBreaker(() => now);
    for (let i = 0; i < AI_CIRCUIT_FAILURE_THRESHOLD; i++) breaker.recordFailure();
    expect(breaker.canRequest()).toBe(false);
  });

  it('a success resets the breaker back to closed with zero failures', () => {
    const breaker = new CircuitBreaker();
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordSuccess();
    for (let i = 0; i < AI_CIRCUIT_FAILURE_THRESHOLD - 1; i++) breaker.recordFailure();
    expect(breaker.state).toBe('closed'); // needed the full threshold again after the reset
  });

  it('moves to half-open after AI_CIRCUIT_OPEN_MS and allows exactly one trial call', () => {
    let now = 0;
    const breaker = new CircuitBreaker(() => now);
    for (let i = 0; i < AI_CIRCUIT_FAILURE_THRESHOLD; i++) breaker.recordFailure();
    expect(breaker.state).toBe('open');

    now += AI_CIRCUIT_OPEN_MS;
    expect(breaker.state).toBe('half_open');
    expect(breaker.canRequest()).toBe(true);
    // A second concurrent call while the trial is in flight is refused.
    expect(breaker.canRequest()).toBe(false);
  });

  it('half-open trial success closes the breaker', () => {
    let now = 0;
    const breaker = new CircuitBreaker(() => now);
    for (let i = 0; i < AI_CIRCUIT_FAILURE_THRESHOLD; i++) breaker.recordFailure();
    now += AI_CIRCUIT_OPEN_MS;
    expect(breaker.canRequest()).toBe(true);

    breaker.recordSuccess();
    expect(breaker.state).toBe('closed');
    expect(breaker.canRequest()).toBe(true);
  });

  // --- M2 review fix: `recordNeutral` (invalid_output/circuit_open outcomes never count as a failure). ---

  it('recordNeutral does not open the breaker even after many consecutive calls', () => {
    const breaker = new CircuitBreaker();
    for (let i = 0; i < AI_CIRCUIT_FAILURE_THRESHOLD * 5; i++) breaker.recordNeutral();
    expect(breaker.state).toBe('closed');
    expect(breaker.canRequest()).toBe(true);
  });

  it('recordNeutral does not reset an already-accumulated failure count (unlike recordSuccess)', () => {
    const now = 0;
    const breaker = new CircuitBreaker(() => now);
    for (let i = 0; i < AI_CIRCUIT_FAILURE_THRESHOLD - 1; i++) breaker.recordFailure();
    breaker.recordNeutral();
    breaker.recordFailure(); // one more failure should still be enough to open it
    expect(breaker.state).toBe('open');
  });

  it('recordNeutral during a half-open trial clears the trial without opening or closing the breaker', () => {
    let now = 0;
    const breaker = new CircuitBreaker(() => now);
    for (let i = 0; i < AI_CIRCUIT_FAILURE_THRESHOLD; i++) breaker.recordFailure();
    now += AI_CIRCUIT_OPEN_MS;
    expect(breaker.canRequest()).toBe(true); // the trial call
    expect(breaker.canRequest()).toBe(false); // a second concurrent call is refused while in flight

    breaker.recordNeutral();
    // Trial slot is free again (still half-open, same elapsed clock) — a new trial call is allowed.
    expect(breaker.canRequest()).toBe(true);
  });

  it('half-open trial failure reopens the breaker for another AI_CIRCUIT_OPEN_MS', () => {
    let now = 0;
    const breaker = new CircuitBreaker(() => now);
    for (let i = 0; i < AI_CIRCUIT_FAILURE_THRESHOLD; i++) breaker.recordFailure();
    now += AI_CIRCUIT_OPEN_MS;
    expect(breaker.canRequest()).toBe(true); // the trial call

    breaker.recordFailure();
    expect(breaker.state).toBe('open');
    expect(breaker.canRequest()).toBe(false);

    now += AI_CIRCUIT_OPEN_MS;
    expect(breaker.state).toBe('half_open');
  });
});
