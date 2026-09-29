/**
 * hooks.ts
 * TanStack Query hooks for `/admin/users`: paginated list + detail queries, and
 * disable/enable/send-reset mutations. Disable/enable invalidate both the list and that user's
 * detail query; window-focus refetch is disabled on every query (no polling in the admin portal —
 * see AdminLayout's idle-logout note).
 * Exports: adminUsersListQueryKey, adminUserDetailQueryKey, useAdminUsersQuery, useAdminUserQuery,
 *   useDisableAdminUserMutation, useEnableAdminUserMutation, useSendResetLinkMutation
 * Spec: docs/spec/05c §5.13 · docs/spec/07 §7.3.4
 */
import type { AdminUserDetailDto, ListAdminUsersQueryInput } from '@campuscoin/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  disableAdminUser,
  enableAdminUser,
  getAdminUser,
  listAdminUsers,
  sendResetLinkAdminUser,
  type AdminUserListResponse,
} from './api';

/** Query key for a `/admin/users` list, scoped by its exact filter/page params. */
export function adminUsersListQueryKey(query: Partial<ListAdminUsersQueryInput> = {}) {
  return ['admin', 'users', 'list', query] as const;
}

/** Query key for a single user's admin detail view. */
export function adminUserDetailQueryKey(id: string) {
  return ['admin', 'users', 'detail', id] as const;
}

/** Reads a page of `/admin/users` for the given search/status filters. */
export function useAdminUsersQuery(query: Partial<ListAdminUsersQueryInput> = {}) {
  return useQuery<AdminUserListResponse>({
    queryKey: adminUsersListQueryKey(query),
    queryFn: () => listAdminUsers(query),
    placeholderData: (previous) => previous,
    refetchOnWindowFocus: false,
  });
}

/** Reads `/admin/users/:id` (the user-detail drawer). */
export function useAdminUserQuery(id: string | null) {
  return useQuery<AdminUserDetailDto>({
    queryKey: adminUserDetailQueryKey(id ?? ''),
    queryFn: () => getAdminUser(id as string),
    enabled: id !== null,
    refetchOnWindowFocus: false,
  });
}

/** Invalidates every cached `/admin/users` list, regardless of filter params. */
function invalidateAdminUsersList(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: ['admin', 'users', 'list'] });
}

/** `POST /admin/users/:id/disable` — invalidates the list and that user's own detail query. */
export function useDisableAdminUserMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => disableAdminUser(id),
    onSuccess: (_data, id) => {
      void invalidateAdminUsersList(queryClient);
      void queryClient.invalidateQueries({ queryKey: adminUserDetailQueryKey(id) });
    },
  });
}

/** `POST /admin/users/:id/enable` — invalidates the list and that user's own detail query. */
export function useEnableAdminUserMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => enableAdminUser(id),
    onSuccess: (_data, id) => {
      void invalidateAdminUsersList(queryClient);
      void queryClient.invalidateQueries({ queryKey: adminUserDetailQueryKey(id) });
    },
  });
}

/** `POST /admin/users/:id/send-reset` — no cache to invalidate, just a one-shot action. */
export function useSendResetLinkMutation() {
  return useMutation({
    mutationFn: (id: string) => sendResetLinkAdminUser(id),
  });
}
