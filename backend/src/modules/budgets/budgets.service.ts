/**
 * budgets.service.ts
 * Business logic for monthly per-category budgets: list-with-consumption, bulk upsert, copy the
 * previous month's budgets, delete, and `getConsumption` — the single-category/month lookup the
 * budget-alert domain-event handler uses to decide whether to notify. Every function takes
 * `userId` from the verified token; a budget not owned by the caller is a 404, never a 403
 * (CLAUDE.md cross-tenant invariant).
 * Main exports: list, upsertMany, copyPrevious, remove, getConsumption, BudgetConsumption
 * Spec: docs/spec/05c §5.11 (budgets & alerts) · Rules: BR-BU-01..03
 */
import {
  TransactionType,
  type BudgetDto,
  type CopyPreviousBudgetsInput,
  type ListBudgetsQueryInput,
  type UpsertBudgetsInput,
} from '@campuscoin/shared';
import { assertUsableCategory } from '../categories/categories.service.js';
import { addDays, firstDayOfMonth, todayInTimeZone, type LocalDate } from '../../lib/dates.js';
import { Decimal, percentOf, toMoney, type MoneyInput } from '../../lib/money.js';
import { notFound, validationFailed } from '../../lib/problem.js';
import { prisma } from '../../lib/prisma.js';
import { usersRepository } from '../users/users.repository.js';
import { budgetsRepository } from './budgets.repository.js';
import { toBudgetDto } from './budgets.mapper.js';

/** Consumption of one budget, as needed by the budget-alert domain-event handler. */
export interface BudgetConsumption {
  id: number;
  categoryId: number;
  month: LocalDate;
  alertThresholdPct: number;
  spent: MoneyInput;
  percent: number;
}

/** The caller's current month in their own timezone, as the canonical `month` (first day). */
async function resolveMonth(userId: string, requested: LocalDate | undefined): Promise<{ month: LocalDate; timezone: string }> {
  const user = await usersRepository.findById(userId);
  if (!user) throw notFound('Account not found.');
  const month = requested ?? firstDayOfMonth(todayInTimeZone(user.timezone));
  return { month, timezone: user.timezone };
}

/** Previous calendar month (first day) relative to `month` — used by {@link copyPrevious} and the dashboard. */
export function previousMonth(month: LocalDate): LocalDate {
  return firstDayOfMonth(addDays(month, -1));
}

/**
 * Every budget the caller has for one month, each with its computed `spent`/`percent`/`status`.
 * `spent` is computed with a single grouped SQL aggregation, not N+1 queries per budget.
 */
export async function list(userId: string, query: ListBudgetsQueryInput): Promise<BudgetDto[]> {
  const { month } = await resolveMonth(userId, query.month);
  const [rows, spentMap] = await Promise.all([
    budgetsRepository.listByUserMonth(userId, month),
    budgetsRepository.spentByCategory(userId, month),
  ]);
  return rows.map((row) => toBudgetDto(row, spentMap.get(row.categoryId) ?? new Decimal(0)));
}

/**
 * BR-BU-02: bulk upsert every category's budget for one month. Each `categoryId` must be an
 * expense category usable by the caller (own or system default, active) — the same ownership
 * rule `transactions.service.ts` enforces for a transaction's category (BR-TX-03).
 * @throws {AppError} 422 validation-failed when the same `categoryId` appears twice in one
 *   request, or when a `categoryId` is not a usable expense category.
 */
export async function upsertMany(userId: string, input: UpsertBudgetsInput): Promise<BudgetDto[]> {
  const seen = new Set<number>();
  for (const item of input.budgets) {
    if (seen.has(item.categoryId)) {
      throw validationFailed([{ field: 'budgets', message: `categoryId ${item.categoryId} was provided more than once.` }]);
    }
    seen.add(item.categoryId);
  }

  for (const item of input.budgets) {
    await assertUsableCategory(userId, item.categoryId, TransactionType.EXPENSE, { requireActive: true });
  }

  await prisma.$transaction((tx) =>
    Promise.all(
      input.budgets.map((item) =>
        budgetsRepository.upsert(
          {
            userId,
            categoryId: item.categoryId,
            month: input.month,
            limitAmount: toMoney(item.limitAmount),
            alertThresholdPct: item.alertThresholdPct,
          },
          tx,
        ),
      ),
    ),
  );

  return list(userId, { month: input.month });
}

/**
 * BR-BU-03: copies every budget from the month immediately before `input.month` into `input.month`.
 * Upserts (not creates), so re-running is safe: a budget already set for `input.month` is
 * overwritten with the previous month's limit/threshold rather than erroring, and a budget the
 * caller already customised for `input.month` but that has no counterpart in the previous month is
 * left untouched (this endpoint only ever copies FROM the previous month, never deletes).
 */
export async function copyPrevious(userId: string, input: CopyPreviousBudgetsInput): Promise<BudgetDto[]> {
  const from = previousMonth(input.month);
  const sourceRows = await budgetsRepository.listByUserMonth(userId, from);

  if (sourceRows.length > 0) {
    await prisma.$transaction((tx) =>
      Promise.all(
        sourceRows.map((row) =>
          budgetsRepository.upsert(
            { userId, categoryId: row.categoryId, month: input.month, limitAmount: row.limitAmount, alertThresholdPct: row.alertThresholdPct },
            tx,
          ),
        ),
      ),
    );
  }

  return list(userId, { month: input.month });
}

/**
 * Hard-deletes one of the caller's own budgets.
 * @throws {AppError} 404 when not found/not owned.
 */
export async function remove(userId: string, id: number): Promise<void> {
  const current = await budgetsRepository.findOwned(id, userId);
  if (!current) throw notFound('Budget not found.');
  await budgetsRepository.deleteOwned(id, userId);
}

/**
 * Consumption of the one budget for `userId`+`categoryId`+`month`, or `null` when no budget is
 * set for that category+month (the budget-alert handler skips silently in that case).
 */
export async function getConsumption(userId: string, categoryId: number, month: LocalDate): Promise<BudgetConsumption | null> {
  const budget = await budgetsRepository.findByUserCategoryMonth(userId, categoryId, month);
  if (!budget) return null;
  const spent = await budgetsRepository.spentForCategory(userId, categoryId, month);
  const percent = percentOf(spent, budget.limitAmount);
  return { id: budget.id, categoryId, month, alertThresholdPct: budget.alertThresholdPct, spent, percent };
}
