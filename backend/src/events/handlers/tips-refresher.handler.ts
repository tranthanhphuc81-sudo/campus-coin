/**
 * tips-refresher.handler.ts
 * Enqueues a debounced `tips.refresh` job (5 min/user) after a transaction change, a bulk
 * category reassignment or a committed CSV import, so the tips list stays relevant without
 * recomputing on every single write. Uses BullMQ's `deduplication` option (v6.3.9, verified
 * supported) with `extend: true` so repeated events within the debounce window keep pushing the
 * job further out — a jobId keyed only on `userId + today` would NOT debounce correctly here:
 * `removeOnComplete: { count: 200 }` keeps completed jobs around, so BullMQ would see a
 * "completed" job with that id already exists and silently drop every later same-day event after
 * the first one ever runs.
 * Main exports: registerTipsRefresherHandler
 * Spec: docs/spec/04 §4.5 (Table 13 – tips.refresh) · §4.6 · docs/spec/05b §5.10 (tips engine)
 */
import { TIPS_REFRESH_DEBOUNCE_MS } from '@campuscoin/shared';
import { tipsRefreshQueue } from '../../jobs/queues.js';
import { on } from '../bus.js';
import type { BulkRecategorizedEventPayload, TransactionEventPayload, TransactionsImportedEventPayload } from '../bus.js';

/** Schedules (or extends) a debounced `tips.refresh` job for `userId`. */
async function scheduleRefresh(userId: string): Promise<void> {
  await tipsRefreshQueue.add(
    'tips-refresh',
    { userId },
    { delay: TIPS_REFRESH_DEBOUNCE_MS, deduplication: { id: `tips-refresh-${userId}`, ttl: TIPS_REFRESH_DEBOUNCE_MS, extend: true, replace: true } },
  );
}

/**
 * Subscribes the tips-refresher handler to every `transaction.*` event, plus
 * `transactions.bulkRecategorized` and `transactions.imported` — this is a deliberate broadening
 * over the original P03 stub's comment (which only mentioned `transaction.*`): a bulk
 * recategorize or a committed CSV import can just as easily make R1-R6's category stats stale,
 * so tips must refresh after those too, mirroring `cache-invalidator.handler.ts`'s own coverage.
 */
export function registerTipsRefresherHandler(): void {
  const onTxn = (payload: TransactionEventPayload): Promise<void> => scheduleRefresh(payload.userId);
  const onBulk = (payload: BulkRecategorizedEventPayload): Promise<void> => scheduleRefresh(payload.userId);
  const onImported = (payload: TransactionsImportedEventPayload): Promise<void> => scheduleRefresh(payload.userId);

  on('transaction.created', onTxn);
  on('transaction.updated', onTxn);
  on('transaction.deleted', onTxn);
  on('transaction.restored', onTxn);
  on('transactions.bulkRecategorized', onBulk);
  on('transactions.imported', onImported);
}
