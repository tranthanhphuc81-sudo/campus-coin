/**
 * hooks.ts
 * TanStack Query hook for `/dashboard/summary`. Query key starts with the literal `'dashboard'`
 * so the transactions/budgets mutation hooks' existing invalidation (`invalidateAfterTransactionChange`
 * in `features/transactions/hooks.ts`, `invalidateAfterBudgetChange` in `features/budgets/hooks.ts`)
 * keeps this widget grid in sync after any transaction/budget change.
 * Exports: dashboardSummaryQueryKey, useDashboardSummaryQuery
 * Spec: docs/spec/05b §5.7 Bảng 21
 */
import type { DashboardSummaryDto, DashboardSummaryQueryInput } from '@campuscoin/shared';
import { useQuery } from '@tanstack/react-query';
import { getDashboardSummary } from './api';

/** Query key for the dashboard summary, scoped by month. Must start with `'dashboard'`. */
export function dashboardSummaryQueryKey(query: DashboardSummaryQueryInput) {
  return ['dashboard', 'summary', query] as const;
}

/** Reads the aggregate dashboard summary for the given month (omitted = caller's current month). */
export function useDashboardSummaryQuery(query: DashboardSummaryQueryInput) {
  return useQuery<DashboardSummaryDto>({
    queryKey: dashboardSummaryQueryKey(query),
    queryFn: () => getDashboardSummary(query),
  });
}
