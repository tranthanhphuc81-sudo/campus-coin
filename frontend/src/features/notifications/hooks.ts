/**
 * hooks.ts
 * TanStack Query hooks for `/notifications`: list + unread count (falls back to
 * `NOTIFICATION_POLL_INTERVAL_MS` polling when SSE is unavailable — see `useNotificationStream`,
 * which disables this hook's polling once a live stream connects), plus mark-one/mark-all-read
 * mutations.
 * Exports: notificationsListQueryKey, useNotificationsQuery, useMarkReadMutation,
 *   useMarkAllReadMutation
 * Spec: docs/spec/05c §5.11 · docs/spec/07 §7.3.3
 */
import { NOTIFICATION_POLL_INTERVAL_MS, type ListNotificationsQueryInput, type NotificationListResponse } from '@campuscoin/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiError } from '../../lib/apiClient/apiError';
import { listNotifications, markAllNotificationsRead, markNotificationRead } from './api';

/** Query key for a `/notifications` list, scoped by its query params. Must start with `'notifications'`. */
export function notificationsListQueryKey(query: Partial<ListNotificationsQueryInput> = {}) {
  return ['notifications', 'list', query] as const;
}

interface UseNotificationsQueryOptions {
  /** Disables the polling fallback (an SSE connection is live) — see `useNotificationStream`. */
  pollingEnabled?: boolean;
}

/** Reads a page of notifications + unread count; polls every {@link NOTIFICATION_POLL_INTERVAL_MS} unless `pollingEnabled` is false. */
export function useNotificationsQuery(
  query: Partial<ListNotificationsQueryInput> = {},
  { pollingEnabled = true }: UseNotificationsQueryOptions = {},
) {
  return useQuery<NotificationListResponse>({
    queryKey: notificationsListQueryKey(query),
    queryFn: () => listNotifications(query),
    refetchInterval: pollingEnabled ? NOTIFICATION_POLL_INTERVAL_MS : false,
  });
}

/** Marks one notification read; optimistically updates every cached list's `unreadCount`/`readAt`. */
export function useMarkReadMutation() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: async (id: string) => {
      await markNotificationRead(id);
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['notifications'] });
      const snapshot = queryClient.getQueriesData<NotificationListResponse>({ queryKey: ['notifications'] });
      for (const [key, data] of snapshot) {
        if (!data) continue;
        const target = data.data.find((n) => n.id === id);
        if (!target || target.readAt) continue;
        queryClient.setQueryData<NotificationListResponse>(key, {
          ...data,
          unreadCount: Math.max(0, data.unreadCount - 1),
          data: data.data.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)),
        });
      }
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

/** Marks every notification read. */
export function useMarkAllReadMutation() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, void>({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
}
