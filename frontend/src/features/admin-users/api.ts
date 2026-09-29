/**
 * api.ts
 * Thin wrappers around `/admin/users` (search/list/detail + disable/enable/send-reset actions).
 * Exports: listAdminUsers, getAdminUser, disableAdminUser, enableAdminUser, sendResetLinkAdminUser,
 *   AdminUserListResponse
 * Spec: docs/spec/05c §5.13 · docs/spec/07 §7.3.4
 */
import type { AdminUserDetailDto, AdminUserListItemDto, ListAdminUsersQueryInput } from '@campuscoin/shared';
import { apiClient } from '../../lib/apiClient/apiClient';

/** Pagination envelope returned by `GET /admin/users`. */
export interface AdminUserListResponse {
  data: AdminUserListItemDto[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

/** `GET /admin/users?q=&status=&page=&limit=` — searchable, filterable, paginated user list. */
export async function listAdminUsers(query: Partial<ListAdminUsersQueryInput> = {}): Promise<AdminUserListResponse> {
  const response = await apiClient.get<AdminUserListResponse>('/admin/users', { params: query });
  return response.data;
}

/** `GET /admin/users/:id` — full email + transaction COUNT only (never transaction content). */
export async function getAdminUser(id: string): Promise<AdminUserDetailDto> {
  const response = await apiClient.get<AdminUserDetailDto>(`/admin/users/${id}`);
  return response.data;
}

/** `POST /admin/users/:id/disable` — also signs the user out everywhere (BR-AU-08). */
export async function disableAdminUser(id: string): Promise<void> {
  await apiClient.post(`/admin/users/${id}/disable`);
}

/** `POST /admin/users/:id/enable`. */
export async function enableAdminUser(id: string): Promise<void> {
  await apiClient.post(`/admin/users/${id}/enable`);
}

/** `POST /admin/users/:id/send-reset` — always 202; the backend never reveals whether the target was active. */
export async function sendResetLinkAdminUser(id: string): Promise<void> {
  await apiClient.post(`/admin/users/${id}/send-reset`);
}
