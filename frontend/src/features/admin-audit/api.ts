/**
 * api.ts
 * Thin wrapper around the read-only `/admin/audit-logs` endpoint.
 * Exports: listAdminAuditLogs, AdminAuditLogListResponse
 * Spec: docs/spec/09 §9.12 · docs/spec/07 §7.3.4
 */
import type { AdminAuditLogDto, AdminAuditLogQueryInput } from '@campuscoin/shared';
import { apiClient } from '../../lib/apiClient/apiClient';

/** Pagination envelope returned by `GET /admin/audit-logs`. */
export interface AdminAuditLogListResponse {
  data: AdminAuditLogDto[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

/** `GET /admin/audit-logs?from=&to=&action=&actorId=&page=&limit=` — read-only. */
export async function listAdminAuditLogs(query: Partial<AdminAuditLogQueryInput> = {}): Promise<AdminAuditLogListResponse> {
  const response = await apiClient.get<AdminAuditLogListResponse>('/admin/audit-logs', { params: query });
  return response.data;
}
