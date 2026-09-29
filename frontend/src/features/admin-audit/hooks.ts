/**
 * hooks.ts
 * TanStack Query hook for the read-only `/admin/audit-logs` list. Window-focus refetch is disabled
 * (no polling in the admin portal — see AdminLayout's idle-logout note).
 * Exports: adminAuditLogsQueryKey, useAdminAuditLogsQuery
 * Spec: docs/spec/09 §9.12
 */
import type { AdminAuditLogQueryInput } from '@campuscoin/shared';
import { useQuery } from '@tanstack/react-query';
import { listAdminAuditLogs, type AdminAuditLogListResponse } from './api';

/** Query key for a `/admin/audit-logs` page, scoped by its exact filter/page params. */
export function adminAuditLogsQueryKey(query: Partial<AdminAuditLogQueryInput> = {}) {
  return ['admin', 'auditLogs', 'list', query] as const;
}

/** Reads a page of `/admin/audit-logs` for the given filters. */
export function useAdminAuditLogsQuery(query: Partial<AdminAuditLogQueryInput> = {}) {
  return useQuery<AdminAuditLogListResponse>({
    queryKey: adminAuditLogsQueryKey(query),
    queryFn: () => listAdminAuditLogs(query),
    placeholderData: (previous) => previous,
    refetchOnWindowFocus: false,
  });
}
