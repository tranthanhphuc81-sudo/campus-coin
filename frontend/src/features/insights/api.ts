/**
 * api.ts
 * Thin wrappers around `/insights/*` (docs/spec/05b §5.9): monthly AI/template insight history,
 * one month's insight, and triggering a regenerate. Mirrors `features/reports/api.ts`'s shape.
 * Exports: getInsights, getInsightByMonth, regenerateInsight
 * Spec: docs/spec/05b §5.9 · docs/spec/07 §7.3.3 (insights routes)
 */
import type { InsightDto, InsightListResponse, ListInsightsQueryInput } from '@campuscoin/shared';
import { apiClient } from '../../lib/apiClient/apiClient';

/** `GET /insights?page=&limit=` — history, newest month first. */
export async function getInsights(query: ListInsightsQueryInput): Promise<InsightListResponse> {
  const response = await apiClient.get<InsightListResponse>('/insights', { params: query });
  return response.data;
}

/** `GET /insights/:month` — any `YYYY-MM-DD` inside the target month works. */
export async function getInsightByMonth(month: string): Promise<InsightDto> {
  const response = await apiClient.get<InsightDto>(`/insights/${month}`);
  return response.data;
}

/**
 * `POST /insights/:month/regenerate` — returns 202 with no body; the real data lands async and is
 * picked up by polling `GET /insights/:month` (or the list) while `status` is `queued`/`processing`.
 */
export async function regenerateInsight(month: string): Promise<void> {
  await apiClient.post(`/insights/${month}/regenerate`);
}
