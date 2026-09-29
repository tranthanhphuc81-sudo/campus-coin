/**
 * recurring.service.ts
 * Business logic for recurring transaction rules: list, create, update (with the merged-state
 * cross-field frequency check and `nextRunDate` recomputation rules from D12), delete, and
 * `buildInlineRule` — the recurrence math shared with `transactions.service.ts`'s inline
 * `POST /transactions` `recurring` field (D10). Every function takes `userId` from the verified
 * token; a rule not owned by the caller is a 404, never a 403 (CLAUDE.md cross-tenant invariant).
 * Main exports: list, create, update, remove, buildInlineRule, assertUnderRuleCap,
 *   listActiveForRange
 * Spec: docs/spec/05a §5.4.2 · Rules: BR-TX-01..08 (shared category/amount rules)
 */
import {
  RECURRING_RULES_MAX,
  RecurringFrequency,
  type CreateRecurringRuleInput,
  type RecurringInlineInput,
  type RecurringRuleDto,
  type TransactionType,
  type UpdateRecurringRuleInput,
} from '@campuscoin/shared';
import { assertUsableCategory } from '../categories/categories.service.js';
import { addDays, fromDbDate, isoWeekday, todayInTimeZone, toDbDate, type LocalDate } from '../../lib/dates.js';
import { assertMoneyMatchesCurrency, toMoney } from '../../lib/money.js';
import { conflict, notFound, validationFailed } from '../../lib/problem.js';
import { occurrenceOnOrAfter, type RecurrenceSpec } from '../../lib/recurrence.js';
import { usersRepository } from '../users/users.repository.js';
import type { CreateRecurringRuleData, Db, UpdateRecurringRuleData } from './recurring.repository.js';
import { recurringRepository } from './recurring.repository.js';
import { toRecurringRuleDto, type RecurringRuleWithCategory } from './recurring.mapper.js';

/** The transaction fields {@link buildInlineRule} derives a rule's `categoryId`/`amount`/`type`/`description`/`startDate` from. */
export interface InlineRuleTransactionFields {
  categoryId: number;
  amount: string;
  type: TransactionType;
  description: string | null;
  txnDate: LocalDate;
}

/** Later of two local dates (plain string comparison is valid for ISO `YYYY-MM-DD`). */
function maxLocalDate(a: LocalDate, b: LocalDate): LocalDate {
  return a > b ? a : b;
}

/**
 * D12: validates the weekly-vs-monthly/yearly day field on the MERGED (current + patch) state —
 * the Zod schema alone cannot see the rule's current, unchanged frequency/day fields.
 * @throws {AppError} 422 validation-failed on the offending field.
 */
function validateMergedDayFields(frequency: RecurringFrequency, dayOfMonth: number | null, dayOfWeek: number | null): void {
  if (frequency === RecurringFrequency.WEEKLY) {
    if (dayOfWeek == null) throw validationFailed([{ field: 'dayOfWeek', message: 'dayOfWeek is required for a weekly rule.' }]);
    if (dayOfMonth != null) throw validationFailed([{ field: 'dayOfMonth', message: 'dayOfMonth must not be set for a weekly rule.' }]);
  } else {
    if (dayOfMonth == null) throw validationFailed([{ field: 'dayOfMonth', message: `dayOfMonth is required for a ${frequency} rule.` }]);
    if (dayOfWeek != null) throw validationFailed([{ field: 'dayOfWeek', message: `dayOfWeek must not be set for a ${frequency} rule.` }]);
  }
}

/** Lists every rule the caller owns. */
export async function list(userId: string): Promise<RecurringRuleDto[]> {
  const rows = await recurringRepository.listOwned(userId);
  return rows.map(toRecurringRuleDto);
}

/**
 * BR: enforces the {@link RECURRING_RULES_MAX} anti-abuse cap. Shared by this module's own
 * {@link create} AND `transactions.service.ts`'s inline `input.recurring` field on
 * `POST /transactions` — the cap must not be bypassable via either creation path.
 * @throws {AppError} 409 conflict when `userId` already owns `RECURRING_RULES_MAX` rules.
 */
export async function assertUnderRuleCap(userId: string, db?: Db): Promise<void> {
  const owned = await recurringRepository.countOwned(userId, db);
  if (owned >= RECURRING_RULES_MAX) {
    throw conflict(`You can have at most ${RECURRING_RULES_MAX} recurring rules.`);
  }
}

/**
 * Creates a recurring rule.
 * @throws {AppError} 409 conflict when the caller already owns {@link RECURRING_RULES_MAX} rules;
 *   422 validation-failed when the amount doesn't match the user's currency, `endDate` leaves no
 *   valid occurrence, or on category ownership.
 */
export async function create(userId: string, input: CreateRecurringRuleInput): Promise<RecurringRuleDto> {
  await assertUnderRuleCap(userId);

  await assertUsableCategory(userId, input.categoryId, input.type, { requireActive: true });

  const user = await usersRepository.findById(userId);
  if (!user) throw notFound('Account not found.');
  assertMoneyMatchesCurrency(input.amount, user.currency); // BR-TX-01: VND amounts must be whole numbers.

  const spec: RecurrenceSpec = {
    frequency: input.frequency,
    intervalCount: input.intervalCount,
    dayOfMonth: input.dayOfMonth ?? null,
    dayOfWeek: input.dayOfWeek ?? null,
    startDate: input.startDate,
    endDate: input.endDate ?? null,
  };
  const from = maxLocalDate(input.startDate, todayInTimeZone(user.timezone));
  const nextRunDate = occurrenceOnOrAfter(spec, from);
  if (nextRunDate === null) {
    throw validationFailed([{ field: 'endDate', message: 'endDate must allow at least one occurrence.' }]);
  }

  const created = await recurringRepository.create({
    userId,
    categoryId: input.categoryId,
    type: input.type,
    amount: toMoney(input.amount),
    description: input.description ?? null,
    frequency: input.frequency,
    intervalCount: input.intervalCount,
    dayOfMonth: input.dayOfMonth ?? null,
    dayOfWeek: input.dayOfWeek ?? null,
    startDate: toDbDate(input.startDate),
    endDate: input.endDate ? toDbDate(input.endDate) : null,
    nextRunDate: toDbDate(nextRunDate),
  });

  return toRecurringRuleDto(created);
}

/**
 * Partially updates one of the caller's own rules (D12: `type`/`startDate` are immutable —
 * enforced by {@link UpdateRecurringRuleInput} already rejecting those fields).
 * @throws {AppError} 404 when not found/not owned; 422 on the merged cross-field day check, on
 *   category ownership, on an `amount` that doesn't match the user's currency, or when the
 *   recomputed `nextRunDate` would leave no valid occurrence.
 */
export async function update(userId: string, id: number, input: UpdateRecurringRuleInput): Promise<RecurringRuleDto> {
  const current = await recurringRepository.findOwned(id, userId);
  if (!current) throw notFound('Recurring rule not found.');

  if (input.categoryId !== undefined && input.categoryId !== current.categoryId) {
    await assertUsableCategory(userId, input.categoryId, current.type as TransactionType, { requireActive: true });
  }

  if (input.amount !== undefined) {
    const owner = await usersRepository.findById(userId);
    if (!owner) throw notFound('Account not found.');
    assertMoneyMatchesCurrency(input.amount, owner.currency); // BR-TX-01: VND amounts must be whole numbers.
  }

  const mergedFrequency = input.frequency ?? (current.frequency as RecurringFrequency);
  const mergedIntervalCount = input.intervalCount ?? current.intervalCount;
  const mergedDayOfMonth = input.dayOfMonth !== undefined ? input.dayOfMonth : current.dayOfMonth;
  const mergedDayOfWeek = input.dayOfWeek !== undefined ? input.dayOfWeek : current.dayOfWeek;
  const currentEndDate = current.endDate ? fromDbDate(current.endDate) : null;
  const mergedEndDate = input.endDate !== undefined ? input.endDate : currentEndDate;
  validateMergedDayFields(mergedFrequency, mergedDayOfMonth, mergedDayOfWeek);

  const frequencyChanged = input.frequency !== undefined && input.frequency !== current.frequency;
  const intervalChanged = input.intervalCount !== undefined && input.intervalCount !== current.intervalCount;
  const dayOfMonthChanged = input.dayOfMonth !== undefined && input.dayOfMonth !== current.dayOfMonth;
  const dayOfWeekChanged = input.dayOfWeek !== undefined && input.dayOfWeek !== current.dayOfWeek;
  const endDateChanged = input.endDate !== undefined && input.endDate !== currentEndDate;
  const resuming = input.isActive === true && !current.isActive;
  const needsRecompute = frequencyChanged || intervalChanged || dayOfMonthChanged || dayOfWeekChanged || endDateChanged || resuming;

  const updateData: UpdateRecurringRuleData = {
    ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
    ...(input.amount !== undefined ? { amount: toMoney(input.amount) } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.frequency !== undefined ? { frequency: input.frequency } : {}),
    ...(input.intervalCount !== undefined ? { intervalCount: input.intervalCount } : {}),
    ...(input.dayOfMonth !== undefined ? { dayOfMonth: input.dayOfMonth } : {}),
    ...(input.dayOfWeek !== undefined ? { dayOfWeek: input.dayOfWeek } : {}),
    ...(input.endDate !== undefined ? { endDate: input.endDate ? toDbDate(input.endDate) : null } : {}),
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
  };

  if (needsRecompute) {
    const user = await usersRepository.findById(userId);
    if (!user) throw notFound('Account not found.');
    const mergedSpec: RecurrenceSpec = {
      frequency: mergedFrequency,
      intervalCount: mergedIntervalCount,
      dayOfMonth: mergedDayOfMonth,
      dayOfWeek: mergedDayOfWeek,
      startDate: fromDbDate(current.startDate),
      endDate: mergedEndDate,
    };
    const from = maxLocalDate(fromDbDate(current.startDate), todayInTimeZone(user.timezone));
    const nextRunDate = occurrenceOnOrAfter(mergedSpec, from);
    if (nextRunDate === null) {
      throw validationFailed([{ field: 'endDate', message: 'endDate must allow at least one occurrence.' }]);
    }
    updateData.nextRunDate = toDbDate(nextRunDate);
  }

  const updated = await recurringRepository.updateOwned(id, userId, updateData);
  if (!updated) throw notFound('Recurring rule not found.'); // B-M1: repository-level race guard, same 404 as the findOwned check above.
  return toRecurringRuleDto(updated);
}

/**
 * P14 §5.14 (forecast): every active rule of `userId` that could still generate an occurrence
 * overlapping `[rangeStart, rangeEnd]`, with its category joined. Exposed as a service function
 * (not a raw repository call) so `forecast.service.ts` never reaches into this module's repository
 * directly (CLAUDE.md: modules talk to each other via services only).
 */
export function listActiveForRange(userId: string, rangeStart: LocalDate, rangeEnd: LocalDate): Promise<RecurringRuleWithCategory[]> {
  return recurringRepository.activeRulesForRange(userId, toDbDate(rangeStart), toDbDate(rangeEnd));
}

/**
 * Hard-deletes one of the caller's own rules. Transactions it previously generated survive with
 * `recurringRuleId: null` (Prisma FK `onDelete: SetNull`).
 * @throws {AppError} 404 when not found/not owned.
 */
export async function remove(userId: string, id: number): Promise<void> {
  const current = await recurringRepository.findOwned(id, userId);
  if (!current) throw notFound('Recurring rule not found.');
  const deleted = await recurringRepository.deleteOwned(id, userId);
  if (deleted.count === 0) throw notFound('Recurring rule not found.'); // B-M1: repository-level race guard.
}

/**
 * D10: builds the insert data for a `RecurringRule` created inline from `POST /transactions`.
 * `startDate` = the transaction's `txnDate`; `dayOfMonth`/`dayOfWeek` are derived from it per the
 * rule's frequency. D9 (no-backfill): `nextRunDate` starts from `max(txnDate + 1 day, today)`,
 * since the transaction being created already covers `txnDate`'s own period.
 * @throws {AppError} 422 validation-failed when `recurring.endDate` leaves no occurrence after
 *   the transaction date.
 */
export function buildInlineRule(
  userId: string,
  txn: InlineRuleTransactionFields,
  recurring: RecurringInlineInput,
  userTimezone: string,
): CreateRecurringRuleData {
  const isWeekly = recurring.frequency === RecurringFrequency.WEEKLY;
  const dayOfMonth = isWeekly ? null : Number(txn.txnDate.slice(8, 10));
  const dayOfWeek = isWeekly ? isoWeekday(txn.txnDate) : null;

  const spec: RecurrenceSpec = {
    frequency: recurring.frequency,
    intervalCount: recurring.intervalCount,
    dayOfMonth,
    dayOfWeek,
    startDate: txn.txnDate,
    endDate: recurring.endDate ?? null,
  };
  const from = maxLocalDate(addDays(txn.txnDate, 1), todayInTimeZone(userTimezone));
  const nextRunDate = occurrenceOnOrAfter(spec, from);
  if (nextRunDate === null) {
    throw validationFailed([{ field: 'recurring.endDate', message: 'endDate must allow at least one occurrence after the transaction date.' }]);
  }

  return {
    userId,
    categoryId: txn.categoryId,
    type: txn.type,
    amount: toMoney(txn.amount),
    description: txn.description,
    frequency: recurring.frequency,
    intervalCount: recurring.intervalCount,
    dayOfMonth,
    dayOfWeek,
    startDate: toDbDate(txn.txnDate),
    endDate: recurring.endDate ? toDbDate(recurring.endDate) : null,
    nextRunDate: toDbDate(nextRunDate),
  };
}
