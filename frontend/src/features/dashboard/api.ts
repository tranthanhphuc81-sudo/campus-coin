/**
 * api.ts
 * Thin wrapper around the single aggregate `/dashboard/summary` endpoint that backs every widget
 * on the student dashboard.
 * Exports: getDashboardSummary
 * Spec: docs/spec/05b §5.7 Bảng 21
 */
import type { DashboardSummaryDto, DashboardSummaryQueryInput } from '@campuscoin/shared';
import { apiClient } from '../../lib/apiClient/apiClient';

/** `GET /dashboard/summary?month=` — every dashboard widget's data in one call. */
export async function getDashboardSummary(query: DashboardSummaryQueryInput): Promise<DashboardSummaryDto> {
  const response = await apiClient.get<DashboardSummaryDto>('/dashboard/summary', { params: query });
  return response.data;
}
