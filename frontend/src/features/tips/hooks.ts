/**
 * hooks.ts
 * TanStack Query hooks for `/tips/*`. Pin/unpin/dismiss all apply an optimistic update to the
 * cached `['tips','list']` query (dismiss removes the tip immediately, pin/unpin re-sorts it to
 * the top/back-to-place), reconciled by a real refetch once the request settles — mirrors
 * `features/transactions/hooks.ts`'s optimistic delete pattern, simplified (no per-list snapshot
 * fan-out needed since `/tips` has exactly one cached query, no filters/pagination).
 * Exports: useTipsQuery, usePinTipMutation, useUnpinTipMutation, useDismissTipMutation
 * Spec: docs/spec/05b §5.10
 */
import { UserTipStatus, type TipDto, type TipListResponse } from '@campuscoin/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { ApiError } from '../../lib/apiClient/apiError';
import { dismissTip, getTips, pinTip, unpinTip } from './api';

const TIPS_LIST_QUERY_KEY = ['tips', 'list'] as const;

/** Reads the current period's ranked, active tips (pinned first, then score descending). */
export function useTipsQuery() {
  return useQuery<TipListResponse>({
    queryKey: TIPS_LIST_QUERY_KEY,
    queryFn: () => getTips(),
  });
}

/** Snapshots the cached tips list, for optimistic-update rollback on error. */
function snapshotTips(queryClient: QueryClient): TipListResponse | undefined {
  return queryClient.getQueryData<TipListResponse>(TIPS_LIST_QUERY_KEY);
}

/** Re-sorts a tips list the same way the API does: pinned first, then score descending. */
function sortTips(tips: TipDto[]): TipDto[] {
  return [...tips].sort((a, b) => {
    const pinnedDiff = Number(b.status === UserTipStatus.PINNED) - Number(a.status === UserTipStatus.PINNED);
    return pinnedDiff !== 0 ? pinnedDiff : b.score - a.score;
  });
}

/** Shared optimistic-update wiring for the pin/unpin/dismiss mutations below. */
function useTipStatusMutation(mutationFn: (id: string) => Promise<TipDto>, apply: (tips: TipDto[], id: string) => TipDto[]) {
  const queryClient = useQueryClient();
  return useMutation<TipDto, ApiError, string>({
    mutationFn,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: TIPS_LIST_QUERY_KEY });
      const previous = snapshotTips(queryClient);
      if (previous) {
        queryClient.setQueryData<TipListResponse>(TIPS_LIST_QUERY_KEY, { data: apply(previous.data, id) });
      }
      return { previous };
    },
    onError: (_err, _id, context) => {
      const previous = (context as { previous?: TipListResponse } | undefined)?.previous;
      if (previous) queryClient.setQueryData(TIPS_LIST_QUERY_KEY, previous);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: TIPS_LIST_QUERY_KEY }),
  });
}

/** `POST /tips/:id/pin` — optimistically marks the tip pinned and moves it to the top. */
export function usePinTipMutation() {
  return useTipStatusMutation(pinTip, (tips, id) =>
    sortTips(tips.map((tip) => (tip.id === id ? { ...tip, status: UserTipStatus.PINNED } : tip))),
  );
}

/** `POST /tips/:id/unpin` — optimistically marks the tip active and re-sorts by score. */
export function useUnpinTipMutation() {
  return useTipStatusMutation(unpinTip, (tips, id) =>
    sortTips(tips.map((tip) => (tip.id === id ? { ...tip, status: UserTipStatus.ACTIVE } : tip))),
  );
}

/** `POST /tips/:id/dismiss` — optimistically removes the tip from the visible list (feels instant). */
export function useDismissTipMutation() {
  return useTipStatusMutation(dismissTip, (tips, id) => tips.filter((tip) => tip.id !== id));
}
