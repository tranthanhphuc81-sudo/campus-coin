/**
 * bus.ts
 * In-process domain event bus (docs/spec/04 §4.6). A transaction service calls
 * `emitAfterCommit(...)` once its DB write has committed; every registered handler for that
 * event runs independently and asynchronously — a throwing handler is logged and never breaks
 * the request that triggered the event, and never prevents the other handlers from running.
 * Handlers must be idempotent (they may see the same event more than once).
 * Main exports: DomainEventName, TransactionEventPayload, BulkRecategorizedEventPayload,
 *   DomainEventPayloads, on, emitAfterCommit
 * Spec: docs/spec/04 §4.6 (domain events)
 */
import type { CategorySource, TransactionSource, TransactionType } from '@campuscoin/shared';
import { logger } from '../lib/logger.js';

/** Payload shared by every `transaction.*` event. */
export interface TransactionEventPayload {
  userId: string;
  /** `Category.id` is a Prisma `Int`, never a string (F1 fix). */
  categoryId: number;
  /** First day of the transaction's month (`YYYY-MM-01`). */
  month: string;
  /** Decimal string, e.g. `"12.50"` — never a JS number (see backend/src/lib/money.ts). */
  amount: string;
  type: TransactionType;
  /** The affected transaction's id (P10: `ai-learning.handler.ts` idempotency + ownership). */
  transactionId: string;
  /** The affected transaction's optimistic-lock counter, AFTER this change (P10 idempotency key). */
  version: number;
  /** Normalised merchant key, or `null` when the description had nothing to key on (P10 tier-1 learning). */
  merchantKey: string | null;
  /** How the transaction was created (P10: AI-learning only reacts to `manual` saves). */
  source: TransactionSource;
  /** How its category was chosen (P10: AI-learning reacts to `user`/`ai_overridden`/`rule`, not `ai_accepted`/`import`). */
  categorySource: CategorySource;
  /**
   * Pre-update snapshot of the fields a cache-invalidator needs (P07 stage 2/3): lets
   * `transaction.updated` clear both the old and new category's cached month when a
   * transaction's category, month, amount or type changes.
   */
  previous?: { categoryId: number; month: string; amount: string; type: TransactionType };
}

/**
 * Payload for `transactions.bulkRecategorized`: `categories.service.ts`'s reassign-then-delete
 * path moves every transaction of one category to another in a single DB transaction. This is
 * deliberately a DIFFERENT event from `transaction.updated` (one per operation, carrying every
 * affected month) — it carries no real transaction id/amount/type, so listeners that expect the
 * real `transaction.updated` contract (BudgetAlertHandler, AnomalyDetector, AiLearningHandler,
 * TipsRefresher — P09/P10/P13/P14) must never mistake it for one. Only the cache-invalidator
 * subscribes to this event today.
 */
export interface BulkRecategorizedEventPayload {
  userId: string;
  /** Every distinct month (`YYYY-MM-01`) that had at least one moved transaction. */
  months: string[];
  fromCategoryId: number;
  toCategoryId: number;
}

/**
 * Payload for `transactions.imported`: `imports.service.ts`'s `commit` writes every selected row
 * of a CSV import batch in one DB transaction, then emits exactly ONE of these — never one
 * `transaction.created` per row, which would fan out thousands of per-row events/cache-clears/
 * budget-checks for a single bulk historical import. Only the cache-invalidator and budget-alert
 * handlers subscribe to this event (P11 D-note): the AI-learning and anomaly/duplicate-flag
 * handlers are per-transaction-creation concerns that do not apply to a bulk historical import.
 */
export interface TransactionsImportedEventPayload {
  userId: string;
  batchId: string;
  /** Every distinct month (`YYYY-MM-01`) that had at least one committed row. */
  months: string[];
  /** Every distinct `(categoryId, month)` pair that had at least one committed row (budget re-check). */
  categoryMonths: { categoryId: number; month: string }[];
}

/** Maps each domain event name to its payload type. */
export interface DomainEventPayloads {
  'transaction.created': TransactionEventPayload;
  'transaction.updated': TransactionEventPayload;
  'transaction.deleted': TransactionEventPayload;
  'transaction.restored': TransactionEventPayload;
  'transactions.bulkRecategorized': BulkRecategorizedEventPayload;
  'transactions.imported': TransactionsImportedEventPayload;
}

export type DomainEventName = keyof DomainEventPayloads;

type Handler<E extends DomainEventName> = (payload: DomainEventPayloads[E]) => void | Promise<void>;

// A Map (not a plain object keyed by event name) so handler lookup is never treated as untrusted
// property access — `event` is always one of the closed DomainEventName union, never client input.
const handlers = new Map<DomainEventName, Handler<DomainEventName>[]>();

/** Registers `handler` to run whenever `event` is emitted. */
export function on<E extends DomainEventName>(event: E, handler: Handler<E>): void {
  const list = handlers.get(event) ?? [];
  list.push(handler as Handler<DomainEventName>);
  handlers.set(event, list);
}

/**
 * Emits `event` after the caller's DB transaction has committed. Runs on the next tick (never
 * blocks the response) and isolates each handler: one throwing/rejecting handler is logged and
 * does not stop the others.
 */
export function emitAfterCommit<E extends DomainEventName>(event: E, payload: DomainEventPayloads[E]): void {
  setImmediate(() => {
    for (const handler of handlers.get(event) ?? []) {
      void Promise.resolve()
        .then(() => handler(payload))
        .catch((err: unknown) => {
          logger.error({ err, event }, '[events] handler failed');
        });
    }
  });
}

/** Test-only: clears every registered handler. */
export function _resetForTests(): void {
  handlers.clear();
}
