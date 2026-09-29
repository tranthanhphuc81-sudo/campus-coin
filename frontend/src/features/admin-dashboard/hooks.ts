/**
 * hooks.ts
 * TanStack Query hooks for the admin portal's read-only aggregate stats endpoints. Both queries
 * disable window-focus refetch — the admin portal must never let a background refetch silently
 * keep `AdminLayout`'s 30-minute idle timer's underlying session alive (PROGRESS.md P05 note).
 * Exports: adminStatsOverviewQueryKey, adminCategoriesUsageQueryKey, useAdminStatsOverviewQuery,
 *   useAdminCategoriesUsageQuery
 * Spec: docs/spec/05c §5.13 (Table 24)
 */
import type { AdminCategoryUsageDto, AdminStatsOverviewDto } from '@campuscoin/shared';
import { useQuery } from '@tanstack/react-query';
import { getAdminCategoriesUsage, getAdminStatsOverview } from './api';

/** Query key for `/admin/stats/overview`. */
export function adminStatsOverviewQueryKey() {
  return ['admin', 'stats', 'overview'] as const;
}

/** Query key for `/admin/stats/categories-usage`. */
export function adminCategoriesUsageQueryKey() {
  return ['admin', 'stats', 'categories-usage'] as const;
}

/** Reads `/admin/stats/overview` for the admin dashboard's stat cards. */
export function useAdminStatsOverviewQuery() {
  return useQuery<AdminStatsOverviewDto>({
    queryKey: adminStatsOverviewQueryKey(),
    queryFn: () => getAdminStatsOverview(),
    refetchOnWindowFocus: false,
  });
}

/** Reads `/admin/stats/categories-usage` — used by both the overview's "Top categories" widget and the full Statistics page. */
export function useAdminCategoriesUsageQuery() {
  return useQuery<AdminCategoryUsageDto[]>({
    queryKey: adminCategoriesUsageQueryKey(),
    queryFn: () => getAdminCategoriesUsage(),
    refetchOnWindowFocus: false,
  });
}
