/**
 * hooks.ts
 * TanStack Query hook for `GET /activity/recent`. No mutation ever invalidates this query directly
 * — viewing/editing a transaction naturally produces a *new* server-side row next time it's read,
 * so callers that also touch `/transactions` should refetch this alongside (see
 * `RecentlyViewedSection`, which just re-queries on its own schedule like any other list).
 * Exports: useRecentActivityQuery
 * Spec: docs/spec/05c §5.14
 */
import type { RecentActivityDto } from '@campuscoin/shared';
import { useQuery } from '@tanstack/react-query';
import { getRecentActivity } from './api';

/** Reads up to `limit` of the caller's most recently viewed/edited transactions, newest first. */
export function useRecentActivityQuery(limit?: number) {
  return useQuery<RecentActivityDto[]>({
    queryKey: ['activity', 'recent', limit] as const,
    queryFn: () => getRecentActivity(limit),
  });
}
