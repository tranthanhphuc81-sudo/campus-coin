/**
 * api.ts
 * Thin wrappers around `/budgets` (list per month, bulk upsert, copy-previous-month, delete).
 * Exports: listBudgets, upsertBudgets, copyPreviousBudgets, deleteBudget
 * Spec: docs/spec/05c §5.11 (budgets & alerts) · docs/spec/07 §7.3.3
 */
import type { BudgetDto, CopyPreviousBudgetsInput, ListBudgetsQueryInput, UpsertBudgetsInput } from '@campuscoin/shared';
import { apiClient } from '../../lib/apiClient/apiClient';

/** `GET /budgets?month=` — every budget row for the given month (omitted month = caller's current month). */
export async function listBudgets(query: ListBudgetsQueryInput): Promise<BudgetDto[]> {
  const response = await apiClient.get<BudgetDto[]>('/budgets', { params: query });
  return response.data;
}

/** `PUT /budgets` — bulk create/update every category's limit for one month at once. */
export async function upsertBudgets(input: UpsertBudgetsInput): Promise<BudgetDto[]> {
  const response = await apiClient.put<BudgetDto[]>('/budgets', input);
  return response.data;
}

/** `POST /budgets/copy-previous` — copies the prior month's budgets into `input.month`. */
export async function copyPreviousBudgets(input: CopyPreviousBudgetsInput): Promise<BudgetDto[]> {
  const response = await apiClient.post<BudgetDto[]>('/budgets/copy-previous', input);
  return response.data;
}

/** `DELETE /budgets/:id`. */
export async function deleteBudget(id: number): Promise<void> {
  await apiClient.delete(`/budgets/${id}`);
}
