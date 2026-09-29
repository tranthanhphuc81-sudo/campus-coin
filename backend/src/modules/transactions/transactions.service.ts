/**
 * transactions.service.ts
 * Business logic for income/expense transactions: create, partial update (optimistic locking),
 * soft delete/restore (trash), history, filtered/paginated listing, and anomaly/duplicate flag
 * resolution. Every function takes `userId` from the verified token and every DB read/write is
 * scoped by it (CLAUDE.md: cross-tenant access is 404, never 403). Emits `transaction.*` domain
 * events after each DB write commits (P09/P13 handlers react to them).
 * Main exports: create, update, remove, restore, get, history, list, resolveFlag,
 *   CreateTransactionResult
 * Spec: docs/spec/05a §5.4 · docs/spec/07 §7.3.2 · Rules: BR-TX-01..08
 *
 * `create()`'s optional `input.recurring` field (D10) also creates a `RecurringRule` in the same
 * DB transaction — see {@link buildInlineRule} in `../recurring/recurring.service.ts` for the
 * derived-field math (dayOfMonth/dayOfWeek/nextRunDate).
 */
import {
  TRASH_RETENTION_DAYS,
  TXN_DATE_MAX_DAYS_AHEAD,
  TransactionSource,
  type CreateTransactionInput,
  type ListTransactionsQueryInput,
  type RecurringRuleDto,
  type ResolveFlagInput,
  type TransactionDto,
  type TransactionHistoryDto,
  type TransactionType,
  type UpdateTransactionInput,
} from '@campuscoin/shared';
import * as activityService from '../activity/activity.service.js';
import { assertUsableCategory, findUsableCategory } from '../categories/categories.service.js';
import { assertUnderRuleCap, buildInlineRule } from '../recurring/recurring.service.js';
import { toRecurringRuleDto } from '../recurring/recurring.mapper.js';
import { recurringRepository } from '../recurring/recurring.repository.js';
import * as aiService from '../ai/ai.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { addDays, firstDayOfMonth, fromDbDate, todayInTimeZone, toDbDate, type LocalDate } from '../../lib/dates.js';
import { normalizeMerchantKey } from '../../lib/merchantKey.js';
import { assertMoneyMatchesCurrency, compare, toMoney, toMoneyString } from '../../lib/money.js';
import type { PaginationMeta } from '../../lib/pagination.js';
import { buildPaginationMeta, parsePagination } from '../../lib/pagination.js';
import { AppError, conflict, notFound, validationFailed, versionMismatch } from '../../lib/problem.js';
import { prisma } from '../../lib/prisma.js';
import { periodKey } from '../../lib/recurrence.js';
import { usersRepository } from '../users/users.repository.js';
import { deriveCategorySource } from './categorySource.js';
import { emitTransactionEvent, insertTransactionWithHistory } from './transactions.core.js';
import { applyFlag } from './transactions.flags.js';
import { diffChangedFields, toSnapshot, toTransactionHistoryDto } from './history.js';
import { toTransactionDto } from './transactions.mapper.js';
import type { TransactionFilters, UpdateTransactionData } from './transactions.repository.js';
import { transactionsRepository } from './transactions.repository.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Pure BR-TX-01/02 check on an amount/date pair, using the owning user's own currency/timezone
 * (transactions have no `currency` input field — BR-TX-01 note: a transaction's currency is fixed
 * to the user's `currency` at the time of recording). Never throws — returns a field-error list
 * so callers that must collect every offending row's errors (P11 CSV import, which never wants a
 * single bad row to abort the whole re-validation pass) can do so without try/catch per row.
 * `update()`'s "wrong version" 409 and category lookups are NOT covered here — those are separate
 * checks callers run alongside this one.
 * @param user - Owning user's `timezone`/`currency`.
 * @param amount - Decimal string amount (already Zod-shaped, e.g. `"12.50"`).
 * @param txnDate - Local calendar date.
 * @returns Zero or more `{field, message}` entries (never throws).
 */
export function collectBusinessRuleErrors(
  user: { timezone: string; currency: string },
  amount: string,
  txnDate: LocalDate,
): { field: string; message: string }[] {
  const errors: { field: string; message: string }[] = [];
  try {
    assertMoneyMatchesCurrency(amount, user.currency);
  } catch (err) {
    if (err instanceof AppError && err.errors) errors.push(...err.errors);
    else throw err;
  }
  const maxDate = addDays(todayInTimeZone(user.timezone), TXN_DATE_MAX_DAYS_AHEAD);
  if (txnDate > maxDate) {
    errors.push({ field: 'txnDate', message: `Date must not be more than ${TXN_DATE_MAX_DAYS_AHEAD} day(s) in the future.` });
  }
  return errors;
}

/**
 * Re-runs BR-TX-01/02 on the (possibly merged) amount/date of a create or update, using the
 * user's own currency/timezone.
 * @throws {AppError} 422 validation-failed on either amount (VND must be a whole number) or
 *   `txnDate` (more than {@link TXN_DATE_MAX_DAYS_AHEAD} day(s) in the future, per the user's own timezone).
 */
function validateBusiness(user: { timezone: string; currency: string }, amount: string, txnDate: LocalDate): void {
  const errors = collectBusinessRuleErrors(user, amount, txnDate);
  if (errors.length > 0) throw validationFailed(errors);
}

/** Input to {@link resolveAiSuggestion}. */
interface ResolveAiSuggestionInput {
  categoryId: number;
  type: TransactionType;
  description: string | null;
  aiSuggestedCategoryId: number | null;
  aiConfidence: string | null;
}

/** Output of {@link resolveAiSuggestion} — ready to write onto the transaction row. */
interface ResolvedAiSuggestion {
  aiSuggestedCategoryId: number | null;
  aiConfidence: string | null;
  categorySource: ReturnType<typeof deriveCategorySource>;
}

/**
 * D1/D8: derives `categorySource` server-side and silently drops a stale/no-longer-usable AI
 * suggestion (archived category, or a category of the wrong type after an edit) instead of
 * 422ing — an AI suggestion must never block saving a transaction. When the accepted category
 * matches both the suggestion and the caller's own tier-1 personal rule, the source is `rule`
 * (detected here server-side; no client hint is trusted for this).
 */
async function resolveAiSuggestion(userId: string, input: ResolveAiSuggestionInput): Promise<ResolvedAiSuggestion> {
  let aiSuggestedCategoryId = input.aiSuggestedCategoryId;
  let aiConfidence = input.aiConfidence;

  if (aiSuggestedCategoryId !== null) {
    const usable = await findUsableCategory(userId, aiSuggestedCategoryId, input.type, { requireActive: true });
    if (!usable) {
      aiSuggestedCategoryId = null;
      aiConfidence = null;
    }
  }

  let ruleCategoryId: number | null = null;
  if (aiSuggestedCategoryId !== null && aiSuggestedCategoryId === input.categoryId) {
    const merchantKey = normalizeMerchantKey(input.description);
    if (merchantKey) ruleCategoryId = await aiService.findRuleCategoryId(userId, merchantKey);
  }

  const categorySource = deriveCategorySource({ categoryId: input.categoryId, aiSuggestedCategoryId, ruleCategoryId });
  return { aiSuggestedCategoryId, aiConfidence, categorySource };
}

/** Result of {@link create}: the created transaction, plus the recurring rule when `input.recurring` was set (D10). */
export type CreateTransactionResult = TransactionDto & { recurringRule?: RecurringRuleDto };

/**
 * Creates a new transaction (BR-TX-01..04). D10: an optional `input.recurring` also creates a
 * `RecurringRule` in the same DB transaction — the rule's `categoryId`/`amount`/`type`/
 * `description` are copied from this transaction, and `startDate`/`dayOfMonth`/`dayOfWeek` are
 * derived from `input.txnDate` by {@link buildInlineRule}. This first transaction is recorded as
 * `source: 'manual'` (the user explicitly entered it) with `recurringRuleId` set so the job's
 * first future run never regenerates this same period.
 * @throws {AppError} 404 when the account no longer exists; 409 conflict when `input.recurring` is
 *   set and the caller already owns `RECURRING_RULES_MAX` rules; 422 on business-rule failures
 *   (amount/date/category, or an inline `recurring.endDate` leaving no future occurrence).
 */
export async function create(userId: string, input: CreateTransactionInput): Promise<CreateTransactionResult> {
  const user = await usersRepository.findById(userId);
  if (!user) throw notFound('Account not found.');

  validateBusiness(user, input.amount, input.txnDate);
  await assertUsableCategory(userId, input.categoryId, input.type, { requireActive: true });
  const resolvedAi = await resolveAiSuggestion(userId, {
    categoryId: input.categoryId,
    type: input.type,
    description: input.description ?? null,
    aiSuggestedCategoryId: input.aiSuggestedCategoryId ?? null,
    aiConfidence: input.aiConfidence ?? null,
  });

  const recurringInput = input.recurring;
  if (recurringInput) {
    await assertUnderRuleCap(userId); // BR: the RECURRING_RULES_MAX cap applies to this inline path too.
    const ruleData = buildInlineRule(
      userId,
      { categoryId: input.categoryId, amount: input.amount, type: input.type, description: input.description ?? null, txnDate: input.txnDate },
      recurringInput,
      user.timezone,
    );

    const { txn, rule } = await prisma.$transaction(async (tx) => {
      const createdRule = await recurringRepository.create(ruleData, tx);
      const createdTxn = await insertTransactionWithHistory(tx, {
        userId,
        type: input.type,
        categoryId: input.categoryId,
        amount: input.amount,
        currency: user.currency,
        description: input.description ?? null,
        txnDate: input.txnDate,
        source: TransactionSource.MANUAL,
        categorySource: resolvedAi.categorySource,
        aiSuggestedCategoryId: resolvedAi.aiSuggestedCategoryId,
        aiConfidence: resolvedAi.aiConfidence,
        recurringRuleId: createdRule.id,
        recurringPeriod: periodKey(recurringInput.frequency, input.txnDate),
        changedBy: userId,
      });
      return { txn: createdTxn, rule: createdRule };
    });

    emitTransactionEvent('created', txn);
    return { ...toTransactionDto(txn), recurringRule: toRecurringRuleDto(rule) };
  }

  const txn = await prisma.$transaction((tx) =>
    insertTransactionWithHistory(tx, {
      userId,
      type: input.type,
      categoryId: input.categoryId,
      amount: input.amount,
      currency: user.currency,
      description: input.description ?? null,
      txnDate: input.txnDate,
      source: TransactionSource.MANUAL,
      categorySource: resolvedAi.categorySource,
      aiSuggestedCategoryId: resolvedAi.aiSuggestedCategoryId,
      aiConfidence: resolvedAi.aiConfidence,
      changedBy: userId,
    }),
  );

  emitTransactionEvent('created', txn);
  return toTransactionDto(txn);
}

/**
 * Partially updates a transaction (BR-TX-05: optimistic locking via `version`). Re-validates
 * BR-TX-01..04 on the merged (current + patch) values.
 * @throws {AppError} 404 when not found/not owned/soft-deleted; 409 version-mismatch on a stale
 *   `version` (checked twice: once against the read, once against the actual DB row inside the
 *   update transaction, closing the race window between the two); 422 on business-rule failures.
 */
export async function update(userId: string, id: string, input: UpdateTransactionInput): Promise<TransactionDto> {
  const current = await transactionsRepository.findActiveOwned(id, userId);
  if (!current) throw notFound('Transaction not found.');
  if (input.version !== current.version) throw versionMismatch('This transaction was changed by another request.');

  const user = await usersRepository.findById(userId);
  if (!user) throw notFound('Account not found.');

  const mergedType = (input.type ?? current.type) as TransactionType;
  const mergedCategoryId = input.categoryId ?? current.categoryId;
  const mergedAmount = input.amount ?? toMoneyString(current.amount);
  const mergedTxnDate = input.txnDate ?? fromDbDate(current.txnDate);

  validateBusiness(user, mergedAmount, mergedTxnDate);

  // D17: only require the category to be active when it is actually changing; an old transaction
  // stays editable even if its category was later archived.
  const categoryChanged = input.categoryId !== undefined && input.categoryId !== current.categoryId;
  await assertUsableCategory(userId, mergedCategoryId, mergedType, { requireActive: categoryChanged });

  // D1: `categorySource` is always re-derived, never taken from the client. Only recompute the
  // AI fields when something that could change the outcome actually changed (a plain amount/date/
  // description edit with no category or suggestion change keeps the original AI attribution).
  const typeChanged = input.type !== undefined && input.type !== current.type;
  const needsAiRecompute = categoryChanged || input.aiSuggestedCategoryId !== undefined;
  let aiFields: Pick<UpdateTransactionData, 'categorySource' | 'aiSuggestedCategoryId' | 'aiConfidence'> = {};

  if (needsAiRecompute) {
    // A type change with no fresh suggestion invalidates the old one outright (it was suggested
    // for the other type); otherwise carry the current suggestion/confidence forward untouched.
    const mergedSuggested =
      input.aiSuggestedCategoryId !== undefined
        ? input.aiSuggestedCategoryId
        : typeChanged
          ? null
          : current.aiSuggestedCategoryId;
    const mergedConfidence =
      input.aiConfidence !== undefined
        ? input.aiConfidence
        : typeChanged
          ? null
          : current.aiConfidence
            ? toMoneyString(current.aiConfidence, 3)
            : null;

    const resolvedAi = await resolveAiSuggestion(userId, {
      categoryId: mergedCategoryId,
      type: mergedType,
      description: input.description !== undefined ? input.description : current.description,
      aiSuggestedCategoryId: mergedSuggested ?? null,
      aiConfidence: mergedConfidence,
    });
    aiFields = {
      categorySource: resolvedAi.categorySource,
      aiSuggestedCategoryId: resolvedAi.aiSuggestedCategoryId,
      aiConfidence: resolvedAi.aiConfidence ? toMoney(resolvedAi.aiConfidence) : null,
    };
  }

  const beforeSnapshot = toSnapshot(current);
  const updateData: UpdateTransactionData = {
    ...(input.type !== undefined ? { type: input.type } : {}),
    ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
    ...(input.amount !== undefined ? { amount: toMoney(input.amount) } : {}),
    ...(input.description !== undefined
      ? { description: input.description, merchantKey: normalizeMerchantKey(input.description) }
      : {}),
    ...(input.txnDate !== undefined ? { txnDate: toDbDate(input.txnDate) } : {}),
    ...aiFields,
  };

  const updated = await prisma.$transaction(async (tx) => {
    const result = await transactionsRepository.updateVersioned(id, userId, input.version, updateData, tx);
    if (result.count === 0) throw versionMismatch('This transaction was changed by another request.');
    const after = await transactionsRepository.findActiveOwned(id, userId, tx);
    if (!after) throw notFound('Transaction not found.');
    const changedFields = diffChangedFields(beforeSnapshot, toSnapshot(after));
    await transactionsRepository.insertHistory(
      {
        transactionId: id,
        userId,
        action: 'update',
        snapshot: toSnapshot(after) as Prisma.InputJsonValue,
        changedFields: changedFields as Prisma.InputJsonValue,
        changedBy: userId,
      },
      tx,
    );
    return after;
  });

  const monthChanged = fromDbDate(current.txnDate) !== fromDbDate(updated.txnDate);
  const needsPreviousForCache = categoryChanged || input.amount !== undefined || input.type !== undefined || monthChanged;
  emitTransactionEvent(
    'updated',
    updated,
    needsPreviousForCache
      ? {
          categoryId: current.categoryId,
          month: firstDayOfMonth(fromDbDate(current.txnDate)),
          amount: toMoneyString(current.amount),
          type: current.type as TransactionType,
        }
      : undefined,
  );

  await activityService.record(userId, id, 'edited');
  return toTransactionDto(updated);
}

/**
 * Soft-deletes a transaction (BR-TX-07: recoverable for {@link TRASH_RETENTION_DAYS} days).
 * @throws {AppError} 404 when not found/not owned/already deleted.
 */
export async function remove(userId: string, id: string): Promise<void> {
  const current = await transactionsRepository.findActiveOwned(id, userId);
  if (!current) throw notFound('Transaction not found.');

  const now = new Date();
  const txn = await prisma.$transaction(async (tx) => {
    const result = await transactionsRepository.softDelete(id, userId, now, tx);
    if (result.count === 0) throw notFound('Transaction not found.');
    const after = await transactionsRepository.findOwnedAny(id, userId, tx);
    if (!after) throw notFound('Transaction not found.');
    await transactionsRepository.insertHistory(
      {
        transactionId: id,
        userId,
        action: 'delete',
        snapshot: toSnapshot(after) as Prisma.InputJsonValue,
        changedFields: { deletedAt: null } as Prisma.InputJsonValue,
        changedBy: userId,
      },
      tx,
    );
    return after;
  });

  emitTransactionEvent('deleted', txn);
}

/**
 * Restores a soft-deleted transaction from the trash (BR-TX-07).
 * @throws {AppError} 404 when not found/not owned, or purged (deleted more than
 *   {@link TRASH_RETENTION_DAYS} days ago); 409 conflict when it is not currently deleted.
 */
export async function restore(userId: string, id: string): Promise<TransactionDto> {
  const current = await transactionsRepository.findOwnedAny(id, userId);
  if (!current) throw notFound('Transaction not found.');
  if (!current.deletedAt) throw conflict('This transaction is not in the trash.');

  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * MS_PER_DAY);
  if (current.deletedAt < cutoff) throw notFound('Transaction not found.');

  const restored = await prisma.$transaction(async (tx) => {
    const result = await transactionsRepository.restore(id, userId, tx);
    if (result.count === 0) throw notFound('Transaction not found.');
    const after = await transactionsRepository.findActiveOwned(id, userId, tx);
    if (!after) throw notFound('Transaction not found.');
    await transactionsRepository.insertHistory(
      {
        transactionId: id,
        userId,
        action: 'restore',
        snapshot: toSnapshot(after) as Prisma.InputJsonValue,
        changedFields: null,
        changedBy: userId,
      },
      tx,
    );
    return after;
  });

  emitTransactionEvent('restored', restored);
  return toTransactionDto(restored);
}

/**
 * Reads one active transaction owned by the caller (D6: soft-deleted rows 404 here).
 * @throws {AppError} 404 when not found/not owned/soft-deleted.
 */
export async function get(userId: string, id: string): Promise<TransactionDto> {
  const txn = await transactionsRepository.findActiveOwned(id, userId);
  if (!txn) throw notFound('Transaction not found.');
  await activityService.record(userId, id, 'viewed');
  return toTransactionDto(txn);
}

/**
 * Full change history of a transaction, oldest first (BR-TX-06). Accepts soft-deleted rows (D6).
 * @throws {AppError} 404 when not found/not owned.
 */
export async function history(userId: string, id: string): Promise<TransactionHistoryDto[]> {
  const txn = await transactionsRepository.findOwnedAny(id, userId);
  if (!txn) throw notFound('Transaction not found.');
  const rows = await transactionsRepository.listHistory(id, userId);
  return rows.map(toTransactionHistoryDto);
}

/** Result of {@link list}: a page of transactions plus pagination metadata. */
export interface TransactionListResult {
  data: TransactionDto[];
  meta: PaginationMeta;
}

/**
 * Filtered, sorted, paginated list of the caller's own transactions (BR-TX-08).
 * @throws {AppError} 422 when `maxAmount` is less than `minAmount`.
 */
export async function list(userId: string, query: ListTransactionsQueryInput): Promise<TransactionListResult> {
  if (query.minAmount !== undefined && query.maxAmount !== undefined && compare(query.maxAmount, query.minAmount) < 0) {
    throw validationFailed([{ field: 'maxAmount', message: 'maxAmount must not be less than minAmount.' }]);
  }

  const { page, limit, skip, take } = parsePagination(query);
  const filters: TransactionFilters = {
    from: query.from,
    to: query.to,
    type: query.type,
    categoryId: query.categoryId,
    q: query.q,
    minAmount: query.minAmount,
    maxAmount: query.maxAmount,
    deleted: query.deleted,
  };

  const [rows, total] = await Promise.all([
    transactionsRepository.list(userId, filters, skip, take, query.sort),
    transactionsRepository.count(userId, filters),
  ]);

  return { data: rows.map(toTransactionDto), meta: buildPaginationMeta(page, limit, total) };
}

/**
 * Builds the duplicate-detection key set for a batch of candidate rows (P11 CSV import):
 * `` `${txnDate}|${amount}|${description.trim().toLowerCase()}` `` for every EXISTING, non-deleted
 * transaction of `userId` whose date falls within the candidate rows' own min/max date range —
 * imports never reach into `transactionsRepository` directly (CLAUDE.md: modules talk to each
 * other via services only).
 * @param userId - Caller.
 * @param rows - Candidate rows to check (only their date range is used to scope the DB read).
 * @returns The set of existing keys; the caller marks a candidate a duplicate when its own key is
 *   in this set OR repeats an earlier candidate's key within the same import.
 */
export async function findDuplicateKeys(
  userId: string,
  rows: { txnDate: LocalDate; amount: string; description: string | null }[],
): Promise<Set<string>> {
  if (rows.length === 0) return new Set();
  const dates = rows.map((r) => r.txnDate).sort();
  const from = toDbDate(dates[0]!);
  const to = toDbDate(dates[dates.length - 1]!);

  const existing = await transactionsRepository.findForDuplicateCheck(userId, from, to);
  return new Set(
    existing.map((row) => `${fromDbDate(row.txnDate)}|${toMoneyString(row.amount)}|${(row.description ?? '').trim().toLowerCase()}`),
  );
}

/**
 * Resolves an anomaly/duplicate flag (D4, §5.14). `action: 'keep'` clears the targeted flag — the
 * user confirmed the transaction is fine as-is — via {@link applyFlag} (idempotent: already-clear
 * is a no-op, not an error). `action: 'delete'` soft-deletes the transaction outright (same effect
 * as `DELETE /transactions/:id`), but only while the targeted flag is still set — this stops a
 * client from using a stale/already-resolved flag to delete a transaction it no longer applies to.
 * @throws {AppError} 404 when not found/not owned/soft-deleted; 409 conflict when `action: 'delete'`
 *   is sent for a flag that is not currently set.
 */
export async function resolveFlag(userId: string, id: string, input: ResolveFlagInput): Promise<TransactionDto> {
  const current = await transactionsRepository.findActiveOwned(id, userId);
  if (!current) throw notFound('Transaction not found.');

  const field = input.flag === 'anomaly' ? 'isAnomaly' : 'isPossibleDuplicate';

  if (input.action === 'keep') {
    const result = await applyFlag(userId, id, field, false, userId);
    return result ?? toTransactionDto(current); // already false: no-op, return current as-is.
  }

  // action === 'delete'
  // `field` is always the closed 'isAnomaly' | 'isPossibleDuplicate' union, never client input.
  // eslint-disable-next-line security/detect-object-injection
  if (!current[field]) {
    throw conflict('This transaction is not flagged.');
  }
  await remove(userId, id);
  const deleted = await transactionsRepository.findOwnedAny(id, userId);
  if (!deleted) throw notFound('Transaction not found.');
  return toTransactionDto(deleted);
}
