/**
 * anomaly-detector.handler.ts
 * Subscribes to `transaction.created`/`updated` and delegates to
 * `modules/transactions/transactions.flags.ts`'s `evaluateTransactionFlags`, which flags unusually
 * large or duplicate-looking transactions (docs/spec/05c §5.14). No try/catch needed here:
 * `emitAfterCommit` (events/bus.ts) already isolates a throwing handler from the request that
 * triggered it, and `evaluateTransactionFlags` itself wraps its two concerns (anomaly, duplicate)
 * in independent try/catch blocks so one failing never skips the other.
 * Main exports: registerAnomalyDetectorHandler
 * Spec: docs/spec/04 §4.6 · docs/spec/05c §5.14 (advanced UX – anomaly/duplicate detection)
 */
import { evaluateTransactionFlags } from '../../modules/transactions/transactions.flags.js';
import { on } from '../bus.js';

/** Subscribes the anomaly-detector handler to `transaction.created`/`updated`. */
export function registerAnomalyDetectorHandler(): void {
  on('transaction.created', (payload) => evaluateTransactionFlags('created', payload));
  on('transaction.updated', (payload) => evaluateTransactionFlags('updated', payload));
}
