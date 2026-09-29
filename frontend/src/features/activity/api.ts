/**
 * api.ts
 * Thin wrapper around `GET /activity/recent` (docs/spec/05c §5.14): the caller's most recently
 * viewed/edited transactions, newest first. Backs the transactions page's "Recently viewed" strip
 * and (via the dashboard summary's own `recentActivity` field) the dashboard "Recent" widget.
 * Exports: getRecentActivity
 * Spec: docs/spec/05c §5.14
 */
import type { RecentActivityDto } from '@campuscoin/shared';
import { apiClient } from '../../lib/apiClient/apiClient';

/** `GET /activity/recent?limit=` — up to `limit` most recent view/edit rows, newest first. */
export async function getRecentActivity(limit?: number): Promise<RecentActivityDto[]> {
  const response = await apiClient.get<{ data: RecentActivityDto[] }>('/activity/recent', {
    params: limit ? { limit } : undefined,
  });
  return response.data.data;
}
