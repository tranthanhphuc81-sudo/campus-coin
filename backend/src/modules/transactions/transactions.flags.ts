/**
 * transactions.flags.ts
 * Service-level module for the anomaly/duplicate flag write-path (docs/spec/05c §5.14): `applyFlag`
 * is the one idempotent, race-safe entry point that ever writes `isAnomaly`/`isPossibleDuplicate`
 * (used both by `resolveFlag`'s "keep" action and by the detector below); `evaluateTransactionFlags`
 * is the detector itself, called by `events/handlers/anomaly-detector.handler.ts` on every
 * `transaction.created`/`updated` event. Kept as a plain module (no `on(...)` here) so handler
 * registration stays solely in the handler file, per CLAUDE.md's layering.
 * Main exports: applyFlag, evaluateTransactionFlags
 * Spec: docs/spec/05c §5.14 · Rules: BR-TX-ANOMALY (unusual-amount detection), BR-TX-DUP
 *   (possible-duplicate detection)
 */
import {
  ANOMALY_WINDOW_DAYS,
  DUPLICATE_CREATED_WINDOW_MINUTES,
  DUPLICATE_DATE_WINDOW_DAYS,
  NotificationType,
  type TransactionDto,
  type TransactionType,
} from '@campuscoin/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import type { TransactionEventPayload } from '../../events/bus.js';
import { addDays, fromDbDate, toDbDate } from '../../lib/dates.js';
import { findDuplicateMatch, isAnomalousAmount } from '../../lib/flagRules.js';
import { logger } from '../../lib/logger.js';
import { toMoneyString } from '../../lib/money.js';
import { prisma } from '../../lib/prisma.js';
import { notifications as en } from '../../i18n/en.js';
import * as notificationsService from '../notifications/notifications.service.js';
import * as usersService from '../users/users.service.js';
import { diffChangedFields, toSnapshot } from './history.js';
import { toTransactionDto, type TransactionWithCategory } from './transactions.mapper.js';
import { transactionsRepository } from './transactions.repository.js';

const MINUTES_TO_MS = 60_000;

/**
 * Race-safe, idempotent write of one flag field. Reads `before`, no-ops when the row is gone or
 * already at `value` (idempotent against event replay), performs the conditional
 * {@link transactionsRepository.setFlag} write, and — only on a genuine change — appends an
 * `'update'` history row (`changedBy` is `'SYSTEM'` for the detector, the real `userId` for a
 * `resolve-flag` "keep"). Never emits a `transaction.updated` domain event: a flag write must never
 * re-trigger this same detector recursively, and no cached data depends on either flag.
 * @param userId - Owning user (never trusted from anywhere but the verified token/event payload).
 * @param id - Transaction id.
 * @param field - Which flag to write.
 * @param value - The new value.
 * @param changedBy - Actor recorded on the history row (`'SYSTEM'` or a real user id).
 * @param expectedVersion - Optimistic-lock guard: the write only applies while `version` still
 *   matches (lets a concurrent edit win the race without corrupting either side).
 * @returns The updated transaction DTO, or `null` when there was nothing to do (already correct,
 *   the row is gone, or the version moved under us).
 */
export async function applyFlag(
  userId: string,
  id: string,
  field: 'isAnomaly' | 'isPossibleDuplicate',
  value: boolean,
  changedBy: string,
  expectedVersion?: number,
): Promise<TransactionDto | null> {
  const after = await prisma.$transaction(async (tx): Promise<TransactionWithCategory | null> => {
    const before = await transactionsRepository.findActiveOwned(id, userId, tx);
    // `field` is always the closed 'isAnomaly' | 'isPossibleDuplicate' union, never client input.
    // eslint-disable-next-line security/detect-object-injection
    if (!before || before[field] === value) return null; // BR-TX-ANOMALY/DUP: idempotent no-op.

    const result = await transactionsRepository.setFlag(id, userId, field, value, { expectedVersion }, tx);
    if (result.count === 0) return null; // Lost the race — someone else changed it first.

    const updated = await transactionsRepository.findActiveOwned(id, userId, tx);
    if (!updated) return null;

    const changedFields = diffChangedFields(toSnapshot(before), toSnapshot(updated));
    await transactionsRepository.insertHistory(
      {
        transactionId: id,
        userId,
        action: 'update',
        snapshot: toSnapshot(updated) as Prisma.InputJsonValue,
        changedFields: changedFields as Prisma.InputJsonValue,
        changedBy,
      },
      tx,
    );
    return updated;
  });

  return after ? toTransactionDto(after) : null;
}

/**
 * BR-TX-ANOMALY: re-evaluates `txn`'s `isAnomaly` flag against its category's recent peers, only
 * when the change could plausibly affect the outcome (a fresh create, or an update that touched
 * amount/category/type/month — signalled by `payload.previous` being set). Raises/clears the
 * `anomaly:<id>` notification to match. Never throws — a failure here must not stop the sibling
 * duplicate check.
 */
async function evaluateAnomaly(
  kind: 'created' | 'updated',
  payload: TransactionEventPayload,
  txn: TransactionWithCategory,
): Promise<void> {
  if (txn.type !== 'expense') return;
  if (kind === 'updated' && !payload.previous) return;

  try {
    const txnDate = fromDbDate(txn.txnDate);
    const from = toDbDate(addDays(txnDate, -ANOMALY_WINDOW_DAYS));
    const peerRows = await transactionsRepository.findAnomalyPeers(payload.userId, txn.categoryId, txn.id, from, txn.txnDate);
    const peers = peerRows.map((row) => row.amount);
    const baseline = await usersService.getAllowanceBaseline(payload.userId);

    const flag = isAnomalousAmount(txn.amount, peers, baseline);
    if (flag === txn.isAnomaly) return;

    const updated = await applyFlag(payload.userId, txn.id, 'isAnomaly', flag, 'SYSTEM', txn.version);
    if (!updated) return;

    if (flag) {
      await notificationsService.notify(payload.userId, {
        type: NotificationType.ANOMALY,
        title: en.anomaly.title,
        body: en.anomaly.body(toMoneyString(txn.amount), txn.category.name, txnDate),
        payload: { transactionId: txn.id },
        dedupeKey: `anomaly:${txn.id}`,
      });
    } else {
      await notificationsService.clearDedupeKeys(payload.userId, [`anomaly:${txn.id}`]);
    }
  } catch (err) {
    logger.error({ err, transactionId: txn.id }, '[transactions.flags] anomaly check failed');
  }
}

/**
 * BR-TX-DUP: on a fresh create of a non-recurring, not-yet-flagged transaction, looks for a
 * same-user/amount/type transaction close in both `txnDate` and `createdAt` with a matching
 * category or merchant key. Only the newer (this) transaction is ever flagged — the existing
 * candidate is left untouched (TC-25). Never throws.
 */
async function evaluateDuplicate(
  kind: 'created' | 'updated',
  payload: TransactionEventPayload,
  txn: TransactionWithCategory,
): Promise<void> {
  if (kind !== 'created') return;
  if (txn.recurringRuleId !== null || txn.isPossibleDuplicate) return;

  try {
    const txnDateStr = fromDbDate(txn.txnDate);
    const txnDateFrom = toDbDate(addDays(txnDateStr, -DUPLICATE_DATE_WINDOW_DAYS));
    const txnDateTo = toDbDate(addDays(txnDateStr, DUPLICATE_DATE_WINDOW_DAYS));
    const createdAtFrom = new Date(txn.createdAt.getTime() - DUPLICATE_CREATED_WINDOW_MINUTES * MINUTES_TO_MS);
    const createdAtTo = txn.createdAt;

    const candidates = await transactionsRepository.findDuplicateCandidates(
      payload.userId,
      txn.id,
      txn.amount,
      txn.type as TransactionType,
      txnDateFrom,
      txnDateTo,
      createdAtFrom,
      createdAtTo,
    );
    const match = findDuplicateMatch({ id: txn.id, categoryId: txn.categoryId, merchantKey: txn.merchantKey }, candidates);
    if (!match) return;

    const updated = await applyFlag(payload.userId, txn.id, 'isPossibleDuplicate', true, 'SYSTEM', txn.version);
    if (!updated) return;

    await notificationsService.notify(payload.userId, {
      type: NotificationType.DUPLICATE,
      title: en.duplicate.title,
      body: en.duplicate.body(toMoneyString(txn.amount), txnDateStr),
      payload: { transactionId: txn.id, duplicateOfId: match.id },
      dedupeKey: `duplicate:${txn.id}`,
    });
  } catch (err) {
    logger.error({ err, transactionId: txn.id }, '[transactions.flags] duplicate check failed');
  }
}

/**
 * Detector entry point, called by `anomaly-detector.handler.ts` on `transaction.created`/`updated`.
 * Re-reads the transaction fresh (it may have since been deleted, in which case this is a silent
 * no-op) and runs the anomaly and duplicate checks independently, so one failing never skips the
 * other (each has its own try/catch, see {@link evaluateAnomaly}/{@link evaluateDuplicate}).
 * @param kind - Which event fired.
 * @param payload - The domain event payload.
 */
export async function evaluateTransactionFlags(kind: 'created' | 'updated', payload: TransactionEventPayload): Promise<void> {
  const txn = await transactionsRepository.findActiveOwned(payload.transactionId, payload.userId);
  if (!txn) return;

  await evaluateAnomaly(kind, payload, txn);
  await evaluateDuplicate(kind, payload, txn);
}
