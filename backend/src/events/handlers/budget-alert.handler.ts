/**
 * budget-alert.handler.ts
 * Recomputes the affected budget's consumption after a transaction change and raises a
 * `budget_near`/`budget_exceeded` notification when a threshold is crossed (TC-20). Each event
 * always re-derives consumption from the current DB state (SQL SUM, never an incremental delta),
 * so a duplicate event for the same net state is naturally a no-op alongside `notify`'s own
 * `(userId, dedupeKey)` uniqueness. When consumption drops back under a threshold, the previously
 * sent notification(s) are deleted so a later re-crossing can alert again (BR-BU-04) — the unique
 * constraint alone would otherwise block every resend forever.
 * Main exports: registerBudgetAlertHandler
 * Spec: docs/spec/04 §4.6 · docs/spec/05c §5.11 (budgets & alerts) · Rules: BR-BU-04
 */
import { NotificationType } from '@campuscoin/shared';
import * as budgetsService from '../../modules/budgets/budgets.service.js';
import * as notificationsService from '../../modules/notifications/notifications.service.js';
import type { TransactionEventPayload, TransactionsImportedEventPayload } from '../bus.js';
import { on } from '../bus.js';

/** Dedupe key of the "near limit" alert for one budget+month (BR-BU-04: one send per crossing). */
function nearKey(budgetId: number, month: string): string {
  return `budget:${budgetId}:${month}:near`;
}

/** Dedupe key of the "exceeded" alert for one budget+month. */
function exceededKey(budgetId: number, month: string): string {
  return `budget:${budgetId}:${month}:exceeded`;
}

/**
 * Recomputes one budget's consumption (userId+categoryId+month) and raises/clears alerts to match
 * its current percentage. Skips silently when no budget is set for that category+month.
 */
async function checkBudget(userId: string, categoryId: number, month: string): Promise<void> {
  const consumption = await budgetsService.getConsumption(userId, categoryId, month);
  if (!consumption) return;

  const { id, alertThresholdPct, percent } = consumption;
  const near = nearKey(id, month);
  const exceeded = exceededKey(id, month);

  if (percent >= 100) {
    await notificationsService.notify(userId, {
      type: NotificationType.BUDGET_EXCEEDED,
      title: 'Budget exceeded',
      body: `You have used ${percent}% of this category's budget for ${month}.`,
      payload: { budgetId: id, categoryId, month, percent },
      dedupeKey: exceeded,
    });
    return;
  }

  if (percent >= alertThresholdPct) {
    await notificationsService.notify(userId, {
      type: NotificationType.BUDGET_NEAR,
      title: 'Budget near limit',
      body: `You have used ${percent}% of this category's budget for ${month}.`,
      payload: { budgetId: id, categoryId, month, percent },
      dedupeKey: near,
    });
    // BR-BU-04: dropped back from >=100% to 80-99% — the "exceeded" alert no longer applies.
    await notificationsService.clearDedupeKeys(userId, [exceeded]);
    return;
  }

  // Below the alert threshold — neither alert applies (any previously sent ones are cleared).
  await notificationsService.clearDedupeKeys(userId, [near, exceeded]);
}

/**
 * Handles a `transaction.*` event: checks the transaction's current category+month, and (on
 * update/delete/restore) its `previous` category+month too when either changed — a budget in
 * either month/category could be affected, mirroring `cache-invalidator.handler.ts`.
 */
async function handleTransactionEvent(payload: TransactionEventPayload): Promise<void> {
  await checkBudget(payload.userId, payload.categoryId, payload.month);
  if (payload.previous && (payload.previous.categoryId !== payload.categoryId || payload.previous.month !== payload.month)) {
    await checkBudget(payload.userId, payload.previous.categoryId, payload.previous.month);
  }
}

/** Re-checks every distinct `(categoryId, month)` pair affected by a committed CSV import (P11). */
async function handleImportedEvent(payload: TransactionsImportedEventPayload): Promise<void> {
  for (const { categoryId, month } of payload.categoryMonths) {
    await checkBudget(payload.userId, categoryId, month);
  }
}

/** Subscribes the budget-alert handler to every `transaction.*` event, plus `transactions.imported`. */
export function registerBudgetAlertHandler(): void {
  on('transaction.created', handleTransactionEvent);
  on('transaction.updated', handleTransactionEvent);
  on('transaction.deleted', handleTransactionEvent);
  on('transaction.restored', handleTransactionEvent);
  on('transactions.imported', handleImportedEvent);
}
