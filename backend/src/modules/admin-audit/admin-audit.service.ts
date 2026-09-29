/**
 * admin-audit.service.ts
 * Read-only listing of the immutable audit trail for the admin portal.
 * Main exports: list
 * Spec: docs/spec/09 §9.12 (Table 58) · docs/spec/07 §7.3.4
 */
import type { AdminAuditLogDto, AdminAuditLogQueryInput } from '@campuscoin/shared';
import { buildPaginationMeta, parsePagination, type PaginationMeta } from '../../lib/pagination.js';
import { adminAuditRepository } from './admin-audit.repository.js';
import { toAdminAuditLogDto } from './admin-audit.mapper.js';

/** Result of {@link list}. */
export interface AdminAuditLogListResult {
  data: AdminAuditLogDto[];
  meta: PaginationMeta;
}

/** `GET /admin/audit-logs` — filtered by `action`/`actorId`/`from`/`to`, paginated, newest first. */
export async function list(query: AdminAuditLogQueryInput): Promise<AdminAuditLogListResult> {
  const { page, limit, skip, take } = parsePagination(query);
  const filters = {
    from: query.from ? new Date(query.from) : undefined,
    to: query.to ? new Date(query.to) : undefined,
    action: query.action,
    actorId: query.actorId,
  };
  const [rows, total] = await Promise.all([
    adminAuditRepository.list(filters, skip, take),
    adminAuditRepository.count(filters),
  ]);
  return { data: rows.map(toAdminAuditLogDto), meta: buildPaginationMeta(page, limit, total) };
}
