/**
 * activity.service.ts
 * Business logic for the recent-activity feature (docs/spec/05c §5.14): `record` is called
 * inline from `transactions.service.ts`'s `get()`/`update()` and must never fail the request that
 * triggered it (unlike the rest of this codebase's domain-event handlers, this runs synchronously
 * in the request path, so it swallows its own errors here rather than relying on the event bus's
 * catch-and-log). `listRecent` backs `GET /activity/recent` and the dashboard "Recent" widget.
 * Main exports: record, listRecent
 * Spec: docs/spec/05c §5.14
 */
import { type RecentActivityAction, type RecentActivityDto, type TransactionType } from '@campuscoin/shared';
import { logger } from '../../lib/logger.js';
import { toMoneyString } from '../../lib/money.js';
import { fromDbDate } from '../../lib/dates.js';
import { activityRepository, type RecentActivityWithTransaction } from './activity.repository.js';

/**
 * Records a viewed/edited row for `transactionId`, owned by `userId`. Never throws — a failure to
 * record activity must not break the GET/PATCH that triggered it; errors are logged and swallowed.
 * @param userId - Owning user (from the verified token).
 * @param transactionId - The transaction that was viewed/edited.
 * @param action - `'viewed'` or `'edited'`.
 */
export async function record(userId: string, transactionId: string, action: RecentActivityAction): Promise<void> {
  try {
    await activityRepository.recordAndTrim(userId, transactionId, action);
  } catch (err) {
    logger.warn({ err, userId, transactionId }, '[activity] failed to record recent activity');
  }
}

/** Maps one joined repository row into the public {@link RecentActivityDto}. */
function toDto(row: RecentActivityWithTransaction): RecentActivityDto {
  const { transaction } = row;
  return {
    transactionId: row.transactionId,
    action: row.action as RecentActivityAction,
    occurredAt: row.occurredAt.toISOString(),
    description: transaction.description,
    amount: toMoneyString(transaction.amount),
    currency: transaction.currency,
    type: transaction.type as TransactionType,
    txnDate: fromDbDate(transaction.txnDate),
    category: {
      id: transaction.category.id,
      name: transaction.category.name,
      icon: transaction.category.icon ?? '',
      color: transaction.category.color ?? '',
    },
  };
}

/**
 * The `limit` most recently viewed/edited transactions of `userId`, newest first.
 * @param userId - Owning user (from the verified token).
 * @param limit - Max rows to return (already Zod-validated, capped at {@link RECENT_ACTIVITY_MAX_PER_USER}).
 */
export async function listRecent(userId: string, limit: number): Promise<RecentActivityDto[]> {
  const rows = await activityRepository.listRecent(userId, limit);
  return rows.map(toDto);
}
