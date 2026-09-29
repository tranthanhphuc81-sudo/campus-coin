/**
 * api.ts
 * Thin wrappers around the admin portal's read-only aggregate stats endpoints.
 * Exports: getAdminStatsOverview, getAdminCategoriesUsage
 * Spec: docs/spec/05c §5.13 (Table 24) · docs/spec/07 §7.3.4
 */
import type { AdminCategoryUsageDto, AdminStatsOverviewDto } from '@campuscoin/shared';
import { apiClient } from '../../lib/apiClient/apiClient';

/** `GET /admin/stats/overview` — dashboard stat cards (DAU/MAU, users by status, growth, AI acceptance, insights). */
export async function getAdminStatsOverview(): Promise<AdminStatsOverviewDto> {
  const response = await apiClient.get<AdminStatsOverviewDto>('/admin/stats/overview');
  return response.data;
}

/** `GET /admin/stats/categories-usage` — default-category usage, k-anonymity filtered, sorted by transaction count desc. */
export async function getAdminCategoriesUsage(): Promise<AdminCategoryUsageDto[]> {
  const response = await apiClient.get<AdminCategoryUsageDto[]>('/admin/stats/categories-usage');
  return response.data;
}
