/**
 * admin-audit.repository.ts
 * Prisma access for the admin portal's read-only audit-log viewer. `AuditLog` is INSERT/SELECT
 * only (docs/spec/09 §9.12) — this repository never writes.
 * Main exports: adminAuditRepository, AdminAuditLogFilters
 * Spec: docs/spec/09 §9.12 (Table 58)
 */
import type { Prisma } from '../../generated/prisma/client.js';
import type { AuditLogModel } from '../../generated/prisma/models/AuditLog.js';
import type { AppPrismaClient } from '../../lib/prisma.js';
import { prisma } from '../../lib/prisma.js';

/** Optional filters accepted by {@link adminAuditRepository.list}/{@link adminAuditRepository.count}. */
export interface AdminAuditLogFilters {
  from?: Date;
  to?: Date;
  action?: string;
  actorId?: string;
}

/** Builds the `where` clause shared by `list` and `count`. */
function buildWhere(filters: AdminAuditLogFilters): Prisma.AuditLogWhereInput {
  return {
    ...(filters.action ? { action: filters.action } : {}),
    ...(filters.actorId ? { actorId: filters.actorId } : {}),
    ...(filters.from || filters.to
      ? { createdAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } }
      : {}),
  };
}

export const adminAuditRepository = {
  /** One page of audit rows matching `filters`, newest first. */
  list(filters: AdminAuditLogFilters, skip: number, take: number, db: AppPrismaClient = prisma): Promise<AuditLogModel[]> {
    return db.auditLog.findMany({ where: buildWhere(filters), orderBy: { createdAt: 'desc' }, skip, take });
  },

  /** Count matching `list`'s filters, for pagination `meta`. */
  count(filters: AdminAuditLogFilters, db: AppPrismaClient = prisma): Promise<number> {
    return db.auditLog.count({ where: buildWhere(filters) });
  },
};
