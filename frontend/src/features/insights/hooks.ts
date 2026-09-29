/**
 * hooks.ts
 * TanStack Query hooks for `/insights/*`. `useInsightsListQuery` is what `InsightsPage` actually
 * renders (a single timeline query is simpler than juggling one `useInsightByMonthQuery` per card),
 * and polls itself whenever any month in the current page is still `queued`/`processing`;
 * `useInsightByMonthQuery` is kept as a smaller building block for a single-month view (e.g. a
 * future dashboard "Latest insight" live-refresh) and polls the same way.
 * Exports: useInsightsListQuery, useInsightByMonthQuery, useRegenerateInsightMutation
 * Spec: docs/spec/05b §5.9
 */
import type { InsightDto, InsightListResponse, ListInsightsQueryInput } from '@campuscoin/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiError } from '../../lib/apiClient/apiError';
import { getInsightByMonth, getInsights, regenerateInsight } from './api';

/** Polling cadence while an insight is still being generated (mirrors `IMPORT_POLL_INTERVAL_MS`'s intent). */
const INSIGHT_POLL_INTERVAL_MS = 2000;

/** True while the backend is still computing this insight — the caller should keep polling. */
function isGenerating(status: InsightDto['status'] | undefined): boolean {
  return status === 'queued' || status === 'processing';
}

/** Reads a page of insight history (`GET /insights`, newest month first), polling while any entry is still generating. */
export function useInsightsListQuery(query: ListInsightsQueryInput) {
  return useQuery<InsightListResponse>({
    queryKey: ['insights', 'list', query] as const,
    queryFn: () => getInsights(query),
    refetchInterval: (q) => (q.state.data?.data.some((insight) => isGenerating(insight.status)) ? INSIGHT_POLL_INTERVAL_MS : false),
  });
}

/**
 * Reads a single month's insight (`GET /insights/:month`), polling while it is `queued`/`processing`.
 * @param month - First-of-month local date.
 * @param enabled - Set `false` to skip the request entirely (e.g. `InsightsPage`'s `?month=` deep
 *   link only needs this once it knows the month isn't already in the timeline it fetched).
 */
export function useInsightByMonthQuery(month: string, enabled = true) {
  return useQuery<InsightDto>({
    queryKey: ['insights', 'month', month] as const,
    queryFn: () => getInsightByMonth(month),
    enabled: enabled && month.length > 0,
    refetchInterval: (q) => (isGenerating(q.state.data?.status) ? INSIGHT_POLL_INTERVAL_MS : false),
  });
}

/**
 * `POST /insights/:month/regenerate`. Invalidates every cached `/insights` query (list + any
 * single-month query) on success — a low-traffic feature, so a broad invalidate is fine and it
 * lets whichever query the page is using pick up the new `queued` status immediately.
 */
export function useRegenerateInsightMutation() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: (month) => regenerateInsight(month),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['insights'] }),
  });
}
