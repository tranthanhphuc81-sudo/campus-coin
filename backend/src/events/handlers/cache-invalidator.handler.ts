/**
 * cache-invalidator.handler.ts
 * Clears the Redis dashboard/report cache for the affected user + month(s) after a transaction
 * change. When the event carries a `previous` snapshot whose month differs from the current one
 * (a transaction's date/category/amount/type changed), both months are cleared so neither the old
 * nor the new month's cached dashboard/report goes stale. Date-range reports (no single month) are
 * always cleared too, since any transaction change can shift a range total. Also subscribes to the
 * distinct `transactions.bulkRecategorized` event (category reassign-then-delete, P07 D13/D14) and
 * the distinct `transactions.imported` event (P11 CSV import commit) and clears every month either
 * one lists — this is the ONLY handler that reacts to either event.
 * Main exports: registerCacheInvalidatorHandler
 * Spec: docs/spec/04 §4.6 · docs/spec/10 §10.3 (cache strategy; key conventions in lib/cacheKeys.ts)
 */
import { cacheDel, cacheDelByPattern } from '../../lib/cache.js';
import { dashboardKey, reportMonthPattern, reportRangePattern } from '../../lib/cacheKeys.js';
import type { BulkRecategorizedEventPayload, TransactionEventPayload, TransactionsImportedEventPayload } from '../bus.js';
import { on } from '../bus.js';

/** Clears the cached dashboard/report entries for one `userId` + `month`. */
async function clearMonth(userId: string, month: string): Promise<void> {
  await cacheDel(dashboardKey(userId, month));
  await cacheDelByPattern(reportMonthPattern(userId, month));
}

/** Clears every cached dashboard/report entry a `transaction.*` event could have made stale. */
async function invalidate(payload: TransactionEventPayload): Promise<void> {
  const months = payload.previous && payload.previous.month !== payload.month ? [payload.month, payload.previous.month] : [payload.month];

  for (const month of months) {
    await clearMonth(payload.userId, month);
  }
  await cacheDelByPattern(reportRangePattern(payload.userId));
}

/** Clears every affected month for a bulk category-reassign operation (one event per operation). */
async function invalidateBulkRecategorized(payload: BulkRecategorizedEventPayload): Promise<void> {
  for (const month of payload.months) {
    await clearMonth(payload.userId, month);
  }
  await cacheDelByPattern(reportRangePattern(payload.userId));
}

/** Clears every affected month for a committed CSV import (one event per commit, P11). */
async function invalidateImported(payload: TransactionsImportedEventPayload): Promise<void> {
  for (const month of payload.months) {
    await clearMonth(payload.userId, month);
  }
  await cacheDelByPattern(reportRangePattern(payload.userId));
}

/** Subscribes the cache-invalidator handler to every `transaction.*` event, plus the two bulk events. */
export function registerCacheInvalidatorHandler(): void {
  on('transaction.created', invalidate);
  on('transaction.updated', invalidate);
  on('transaction.deleted', invalidate);
  on('transaction.restored', invalidate);
  on('transactions.bulkRecategorized', invalidateBulkRecategorized);
  on('transactions.imported', invalidateImported);
}
