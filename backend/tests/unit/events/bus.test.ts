/**
 * bus.test.ts
 * Unit tests for the domain event bus (backend/src/events/bus.ts): handlers run for the emitted
 * event, and a throwing/rejecting handler never stops the other handlers or the caller.
 * Spec: docs/spec/04 §4.6 (domain events)
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { _resetForTests, emitAfterCommit, on, type TransactionEventPayload } from '../../../src/events/bus.js';

const payload: TransactionEventPayload = {
  userId: 'user-1',
  categoryId: 1,
  month: '2026-09-01',
  amount: '12.50',
  type: 'expense',
  transactionId: 'txn-1',
  version: 1,
  merchantKey: 'campus cafe',
  source: 'manual',
  categorySource: 'user',
};

afterEach(() => {
  _resetForTests();
});

describe('emitAfterCommit', () => {
  it('calls every handler registered for the event with the payload', async () => {
    const handlerA = vi.fn();
    const handlerB = vi.fn();
    on('transaction.created', handlerA);
    on('transaction.created', handlerB);

    emitAfterCommit('transaction.created', payload);
    await vi.waitFor(() => {
      expect(handlerA).toHaveBeenCalledWith(payload);
      expect(handlerB).toHaveBeenCalledWith(payload);
    });
  });

  it('never calls a handler registered for a different event', async () => {
    const handler = vi.fn();
    on('transaction.deleted', handler);

    emitAfterCommit('transaction.created', payload);
    await new Promise((resolve) => setImmediate(resolve));

    expect(handler).not.toHaveBeenCalled();
  });

  it('logs and continues when one handler throws, without stopping the others', async () => {
    const failing = vi.fn(() => {
      throw new Error('boom');
    });
    const succeeding = vi.fn();
    on('transaction.updated', failing);
    on('transaction.updated', succeeding);

    emitAfterCommit('transaction.updated', payload);

    await vi.waitFor(() => {
      expect(failing).toHaveBeenCalled();
      expect(succeeding).toHaveBeenCalled();
    });
  });

  it('does not run handlers synchronously (runs after commit, not during it)', () => {
    const handler = vi.fn();
    on('transaction.restored', handler);

    emitAfterCommit('transaction.restored', payload);

    expect(handler).not.toHaveBeenCalled();
  });
});
