/**
 * budgets.mapper.ts
 * Maps a Prisma `Budget` row (joined with its `Category`) plus its computed `spent` total into
 * the public {@link BudgetDto}. The field list is the whitelist — `userId` is never sent to the
 * client (CLAUDE.md security invariant).
 * Main exports: toBudgetDto
 * Spec: docs/spec/05c §5.11 (budget DTO) · docs/spec/05b §5.7 Bảng 21 (status thresholds)
 */
import { BUDGET_STATUS_AMBER_PCT, BUDGET_STATUS_RED_PCT, BudgetStatus, type BudgetDto } from '@campuscoin/shared';
import { fromDbDate } from '../../lib/dates.js';
import { percentOf, toMoneyString, type Decimal, type MoneyInput } from '../../lib/money.js';
import type { BudgetWithCategory } from './budgets.repository.js';

/**
 * BR-BU-01: traffic-light status of a consumption percentage — fixed dashboard thresholds
 * ({@link BUDGET_STATUS_AMBER_PCT}/{@link BUDGET_STATUS_RED_PCT}), independent of the budget's own
 * customisable `alertThresholdPct` (that field only controls when a `budget_near` notification is
 * sent, not this widget colour). Pure function, unit-tested directly.
 * @param percent - Consumption percentage (spent / limit * 100).
 */
export function statusForPercent(percent: number): BudgetStatus {
  if (percent >= BUDGET_STATUS_RED_PCT) return BudgetStatus.RED;
  if (percent >= BUDGET_STATUS_AMBER_PCT) return BudgetStatus.AMBER;
  return BudgetStatus.GREEN;
}

/**
 * Converts a Prisma `Budget` row (with `category` included) plus its computed `spent` total into
 * the public {@link BudgetDto}.
 * @param budget - Full row with its joined category, as read from the DB.
 * @param spent - Total non-deleted expense spend for this budget's category+month (already
 *   computed by a SQL aggregation — see `budgets.repository.ts`).
 */
export function toBudgetDto(budget: BudgetWithCategory, spent: Decimal | MoneyInput): BudgetDto {
  const percent = percentOf(spent, budget.limitAmount);
  return {
    id: budget.id,
    categoryId: budget.categoryId,
    category: { id: budget.category.id, name: budget.category.name, icon: budget.category.icon, color: budget.category.color },
    month: fromDbDate(budget.month),
    limitAmount: toMoneyString(budget.limitAmount),
    alertThresholdPct: budget.alertThresholdPct,
    spent: toMoneyString(spent),
    percent,
    status: statusForPercent(percent),
    createdAt: budget.createdAt.toISOString(),
    updatedAt: budget.updatedAt.toISOString(),
  };
}
