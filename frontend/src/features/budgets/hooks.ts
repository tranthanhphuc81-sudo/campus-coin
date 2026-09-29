/**
 * hooks.ts
 * TanStack Query hooks for `/budgets`: reads scoped by month, plus bulk-upsert/copy-previous/
 * delete mutations. Every mutation invalidates the `'budgets'` and `'dashboard'` query key
 * prefixes so the Budgets page and the dashboard's "Budget vs actual" widget stay in sync
 * (mirrors `invalidateAfterTransactionChange` in `features/transactions/hooks.ts`, which already
 * invalidates these same prefixes after a transaction changes a budget's `spent`).
 * Exports: budgetsListQueryKey, useBudgetsQuery, useUpsertBudgetsMutation,
 *   useCopyPreviousBudgetsMutation, useDeleteBudgetMutation
 * Spec: docs/spec/05c §5.11 (budgets & alerts)
 */
import type { BudgetDto, CopyPreviousBudgetsInput, ListBudgetsQueryInput, UpsertBudgetsInput } from '@campuscoin/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiError } from '../../lib/apiClient/apiError';
import { copyPreviousBudgets, deleteBudget, listBudgets, upsertBudgets } from './api';

/** Query key for a `/budgets` list, scoped by month. Must start with `'budgets'` (see module doc). */
export function budgetsListQueryKey(query: ListBudgetsQueryInput) {
  return ['budgets', 'list', query] as const;
}

/** Reads every budget row for the given month. */
export function useBudgetsQuery(query: ListBudgetsQueryInput) {
  return useQuery<BudgetDto[]>({
    queryKey: budgetsListQueryKey(query),
    queryFn: () => listBudgets(query),
  });
}

/** Invalidates every cached budgets/dashboard query (dashboard's budget widget reads the same data). */
function invalidateAfterBudgetChange(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['budgets'] });
  void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
}

/** Bulk-saves every changed category limit/threshold for one month via `PUT /budgets`. */
export function useUpsertBudgetsMutation() {
  const queryClient = useQueryClient();
  return useMutation<BudgetDto[], ApiError, UpsertBudgetsInput>({
    mutationFn: (input: UpsertBudgetsInput) => upsertBudgets(input),
    onSuccess: () => invalidateAfterBudgetChange(queryClient),
  });
}

/** Copies the prior month's budgets into the given month. */
export function useCopyPreviousBudgetsMutation() {
  const queryClient = useQueryClient();
  return useMutation<BudgetDto[], ApiError, CopyPreviousBudgetsInput>({
    mutationFn: (input: CopyPreviousBudgetsInput) => copyPreviousBudgets(input),
    onSuccess: () => invalidateAfterBudgetChange(queryClient),
  });
}

/** Deletes a single budget row. */
export function useDeleteBudgetMutation() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, number>({
    mutationFn: (id: number) => deleteBudget(id),
    onSuccess: () => invalidateAfterBudgetChange(queryClient),
  });
}
