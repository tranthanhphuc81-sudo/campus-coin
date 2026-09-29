/**
 * history.ts
 * Builds the append-only audit trail for a transaction (BR-TX-06): a JSON-safe snapshot of a
 * transaction row, a diff between two snapshots (valued with the BEFORE value, so history reads
 * "what it used to be"), and the mapper from a `TransactionHistory` row to the public DTO.
 * Main exports: toSnapshot, diffChangedFields, toTransactionHistoryDto
 * Spec: docs/spec/05a §5.4 (history) · Rules: BR-TX-06
 */
import type { TransactionHistoryDto } from '@campuscoin/shared';
import type { TransactionHistoryModel } from '../../generated/prisma/models/TransactionHistory.js';
import type { TransactionModel } from '../../generated/prisma/models/Transaction.js';
import { fromDbDate } from '../../lib/dates.js';
import { toMoneyString } from '../../lib/money.js';

/** Decimal places stored for `transactions.ai_confidence` (`Decimal(4,3)`). */
const AI_CONFIDENCE_SCALE = 3;

/**
 * Converts a Prisma `Transaction` row into a JSON-safe snapshot for `transaction_history.snapshot`.
 * Never includes `userId`/`merchantKey`/`importBatchId` — internal-only fields, same whitelist
 * discipline as {@link toTransactionDto} (CLAUDE.md: never over-select onto the wire, and this
 * snapshot is itself returned to the owning user via `GET /transactions/:id/history`).
 */
export function toSnapshot(txn: TransactionModel): Record<string, unknown> {
  return {
    id: txn.id,
    categoryId: txn.categoryId,
    type: txn.type,
    amount: toMoneyString(txn.amount),
    currency: txn.currency,
    description: txn.description,
    txnDate: fromDbDate(txn.txnDate),
    source: txn.source,
    recurringRuleId: txn.recurringRuleId,
    recurringPeriod: txn.recurringPeriod,
    categorySource: txn.categorySource,
    aiSuggestedCategoryId: txn.aiSuggestedCategoryId,
    aiConfidence: txn.aiConfidence ? toMoneyString(txn.aiConfidence, AI_CONFIDENCE_SCALE) : null,
    isAnomaly: txn.isAnomaly,
    isPossibleDuplicate: txn.isPossibleDuplicate,
    version: txn.version,
    deletedAt: txn.deletedAt ? txn.deletedAt.toISOString() : null,
    createdAt: txn.createdAt.toISOString(),
    updatedAt: txn.updatedAt.toISOString(),
  };
}

/**
 * Diffs two JSON-safe snapshots, returning only the keys whose value differs — each valued with
 * the BEFORE value (BR-TX-06: history shows what a field used to be, not what it became).
 */
export function diffChangedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, unknown> {
  const changed: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    // `key` only ever iterates the fixed snapshot's own keys, never client input.
    /* eslint-disable security/detect-object-injection */
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changed[key] = before[key];
    }
    /* eslint-enable security/detect-object-injection */
  }
  return changed;
}

/**
 * Converts a Prisma `TransactionHistory` row into the public {@link TransactionHistoryDto}.
 * @param row - Full row, as read from the DB.
 */
export function toTransactionHistoryDto(row: TransactionHistoryModel): TransactionHistoryDto {
  return {
    id: String(row.id),
    action: row.action,
    snapshot: row.snapshot,
    changedFields: row.changedFields,
    changedBy: row.changedBy,
    changedAt: row.changedAt.toISOString(),
  };
}
