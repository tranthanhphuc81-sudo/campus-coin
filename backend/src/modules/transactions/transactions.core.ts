/**
 * transactions.core.ts
 * The one place that actually inserts a transaction + its 'create' history row, and the one place
 * that turns a transaction row into a `transaction.*` domain event. Shared by `transactions.service.ts`
 * and (stage 3) the recurring-materialize job, so both paths get merchant-key normalisation,
 * history and cache-invalidation events for free.
 * Main exports: CoreCreateInput, insertTransactionWithHistory, createSystemTransaction, emitTransactionEvent
 * Spec: docs/spec/05a §5.4 · docs/spec/04 §4.6 (domain events) · Rules: BR-TX-06
 */
import { IMPORT_COMMIT_CHUNK_SIZE, type CategorySource, type TransactionSource, type TransactionType } from '@campuscoin/shared';
import { Prisma } from '../../generated/prisma/client.js';
import type { TransactionModel } from '../../generated/prisma/models/Transaction.js';
import { emitAfterCommit, type TransactionEventPayload } from '../../events/bus.js';
import { firstDayOfMonth, fromDbDate, toDbDate, type LocalDate } from '../../lib/dates.js';
import { normalizeMerchantKey } from '../../lib/merchantKey.js';
import { toMoney, toMoneyString } from '../../lib/money.js';
import { prisma } from '../../lib/prisma.js';
import { toSnapshot } from './history.js';
import type { TransactionWithCategory } from './transactions.mapper.js';
import { transactionsRepository } from './transactions.repository.js';

/** Splits `items` into chunks of at most `size` (used by {@link insertImportedTransactions} for MySQL-friendly batch sizes). */
function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

/** Input to {@link insertTransactionWithHistory} — everything needed to create one transaction. */
export interface CoreCreateInput {
  userId: string;
  type: TransactionType;
  categoryId: number;
  amount: string;
  currency: string;
  description: string | null;
  txnDate: LocalDate;
  source: TransactionSource;
  categorySource: CategorySource;
  aiSuggestedCategoryId?: number | null;
  aiConfidence?: string | null;
  recurringRuleId?: number | null;
  recurringPeriod?: string | null;
  /** Actor recorded on the 'create' history row: a user id, or `'SYSTEM'` for job-generated rows. */
  changedBy: string;
}

/**
 * Inserts the transaction and its `'create'` history row inside the caller's transaction client.
 * Never emits a domain event — the caller must call {@link emitTransactionEvent} once the
 * surrounding `$transaction` has committed.
 * @param tx - The caller's open Prisma transaction client.
 * @param input - Fields for the new transaction.
 * @returns The inserted row, with its category joined.
 */
export async function insertTransactionWithHistory(
  tx: Prisma.TransactionClient,
  input: CoreCreateInput,
): Promise<TransactionWithCategory> {
  const merchantKey = normalizeMerchantKey(input.description);

  const txn = await transactionsRepository.insert(
    {
      userId: input.userId,
      categoryId: input.categoryId,
      type: input.type,
      amount: toMoney(input.amount),
      currency: input.currency,
      description: input.description,
      merchantKey,
      txnDate: toDbDate(input.txnDate),
      source: input.source,
      categorySource: input.categorySource,
      aiSuggestedCategoryId: input.aiSuggestedCategoryId ?? null,
      aiConfidence: input.aiConfidence ? toMoney(input.aiConfidence) : null,
      recurringRuleId: input.recurringRuleId ?? null,
      recurringPeriod: input.recurringPeriod ?? null,
    },
    tx,
  );

  await transactionsRepository.insertHistory(
    {
      transactionId: txn.id,
      userId: input.userId,
      action: 'create',
      // Snapshot values are all JSON-safe primitives (see history.ts); the wider `unknown` in its
      // return type is only there for the diff helper's ergonomics.
      snapshot: toSnapshot(txn) as Prisma.InputJsonValue,
      changedFields: null,
      changedBy: input.changedBy,
    },
    tx,
  );

  return txn;
}

/**
 * Job entry point: wraps {@link insertTransactionWithHistory} in its own `$transaction` and
 * swallows a UNIQUE(`recurringRuleId`, `recurringPeriod`) violation as "already generated"
 * (idempotent re-run safety for the `recurring.materialize` job — TC-14: running the job twice
 * must not duplicate). Returns `null` when that period was already materialized; otherwise
 * returns the created row, and the caller (the processor) must emit the event AFTER this
 * resolves (never inside the `$transaction`).
 * @param input - Fields for the new (job-generated) transaction.
 */
export async function createSystemTransaction(input: CoreCreateInput): Promise<TransactionWithCategory | null> {
  try {
    return await prisma.$transaction((tx) => insertTransactionWithHistory(tx, input));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return null;
    throw err;
  }
}

/** One row accepted by {@link insertImportedTransactions} — a committed CSV-import row. */
export interface ImportRowInsertInput {
  categoryId: number;
  type: TransactionType;
  amount: string;
  description: string | null;
  txnDate: LocalDate;
  categorySource: CategorySource;
  aiSuggestedCategoryId: number | null;
  aiConfidence: string | null;
}

/**
 * Bulk-inserts every selected+valid row of a committed CSV import (P11 `imports.service.ts`'s
 * `commit`), chunked at {@link IMPORT_COMMIT_CHUNK_SIZE} rows per `createMany`/history-insert call
 * (MySQL via Prisma has no `createManyAndReturn`, so the inserted rows are re-fetched by
 * `userId`+`importBatchId` — safe because `batchId` is unique to this one commit). Every row is
 * written with `source: csv_import` and this `batchId`; `merchantKey` is computed the same way a
 * normal transaction create does, so AI-learning/duplicate-detection keep working on imported rows.
 * MUST be called inside the caller's own `$transaction` — never emits an event itself (the caller
 * emits exactly ONE aggregated `transactions.imported` event after the transaction commits).
 * @param tx - The caller's open Prisma transaction client.
 * @param userId - Owning user (already re-validated by the caller).
 * @param batchId - The `ImportBatch.id` these rows are committed from.
 * @param currency - The owning user's currency (fixed on the transaction, same as manual create).
 * @param rows - Selected, re-validated rows to insert, in any order.
 * @returns The inserted rows (unordered), for the caller to derive affected months/categories.
 */
export async function insertImportedTransactions(
  tx: Prisma.TransactionClient,
  userId: string,
  batchId: string,
  currency: string,
  rows: ImportRowInsertInput[],
): Promise<TransactionModel[]> {
  if (rows.length === 0) return [];

  for (const batch of chunk(rows, IMPORT_COMMIT_CHUNK_SIZE)) {
    await tx.transaction.createMany({
      data: batch.map((row) => ({
        userId,
        categoryId: row.categoryId,
        type: row.type,
        amount: toMoney(row.amount),
        currency,
        description: row.description,
        merchantKey: normalizeMerchantKey(row.description),
        txnDate: toDbDate(row.txnDate),
        source: 'csv_import' as TransactionSource,
        categorySource: row.categorySource,
        importBatchId: batchId,
        aiSuggestedCategoryId: row.aiSuggestedCategoryId,
        aiConfidence: row.aiConfidence ? toMoney(row.aiConfidence) : null,
      })),
    });
  }

  const inserted = await tx.transaction.findMany({ where: { userId, importBatchId: batchId } });

  for (const batch of chunk(inserted, IMPORT_COMMIT_CHUNK_SIZE)) {
    await tx.transactionHistory.createMany({
      data: batch.map((row) => ({
        transactionId: row.id,
        userId,
        action: 'create' as const,
        snapshot: toSnapshot(row) as Prisma.InputJsonValue,
        changedFields: Prisma.DbNull,
        changedBy: userId,
      })),
    });
  }

  return inserted;
}

/**
 * Emits `transaction.<action>` on the domain event bus (docs/spec/04 §4.6). Call ONLY after the
 * DB transaction that produced `txn` has committed — handlers (cache invalidation, tips refresh,
 * budget alerts) must never see a row that a rollback later undid.
 * @param action - Which lifecycle event happened.
 * @param txn - The affected transaction, after the change.
 * @param previous - Pre-update snapshot of the fields a cache-invalidator needs, when they changed
 *   (`transaction.updated` only): lets the handler clear both the old and new month/category.
 */
/** Maps the short lifecycle action to its full `transaction.*` event name. */
const EVENT_NAMES = {
  created: 'transaction.created',
  updated: 'transaction.updated',
  deleted: 'transaction.deleted',
  restored: 'transaction.restored',
} as const;

export function emitTransactionEvent(
  action: keyof typeof EVENT_NAMES,
  txn: TransactionModel,
  previous?: TransactionEventPayload['previous'],
): void {
  const payload: TransactionEventPayload = {
    userId: txn.userId,
    categoryId: txn.categoryId,
    month: firstDayOfMonth(fromDbDate(txn.txnDate)),
    amount: toMoneyString(txn.amount),
    type: txn.type as TransactionType,
    transactionId: txn.id,
    version: txn.version,
    merchantKey: txn.merchantKey,
    source: txn.source as TransactionSource,
    categorySource: txn.categorySource as CategorySource,
    previous,
  };
  // `action` only ever iterates the fixed EVENT_NAMES keys above, never client input.
  // eslint-disable-next-line security/detect-object-injection
  emitAfterCommit(EVENT_NAMES[action], payload);
}
