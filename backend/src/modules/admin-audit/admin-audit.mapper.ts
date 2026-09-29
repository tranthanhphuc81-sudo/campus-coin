/**
 * admin-audit.mapper.ts
 * Maps a Prisma `AuditLog` row to the admin-facing {@link AdminAuditLogDto}. `id` is a BigInt
 * column, serialized as a decimal string (JSON has no native 64-bit integer type). `metadata` is
 * returned mostly as-is, except a known `toEmail` field (e.g. `reports.monthly.share`'s recipient,
 * often not even a CampusCoin user) is masked (Fix 8, security-fix follow-up) — consistent with
 * this same phase's admin-user-list email masking, and deliberately narrow (this is not a generic
 * deep-scanning redactor, just this one known leak).
 * Main exports: toAdminAuditLogDto
 * Spec: docs/spec/09 §9.12 (Table 58)
 */
import type { AdminAuditLogDto } from '@campuscoin/shared';
import type { AuditLogModel } from '../../generated/prisma/models/AuditLog.js';
import { maskEmail } from '../../lib/maskEmail.js';

/** Masks `metadata.toEmail` in place (returning a new object) when it is present as a string. */
function maskMetadata(metadata: unknown): unknown {
  if (typeof metadata === 'object' && metadata !== null && 'toEmail' in metadata && typeof (metadata as { toEmail: unknown }).toEmail === 'string') {
    return { ...metadata, toEmail: maskEmail((metadata as { toEmail: string }).toEmail) };
  }
  return metadata;
}

/**
 * Converts a Prisma `AuditLog` row into the admin-facing {@link AdminAuditLogDto}.
 * @param row - Full row, as read from the DB (never partially selected).
 */
export function toAdminAuditLogDto(row: AuditLogModel): AdminAuditLogDto {
  return {
    id: row.id.toString(),
    actorId: row.actorId,
    actorRole: row.actorRole,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    ipHash: row.ipHash,
    userAgent: row.userAgent,
    metadata: maskMetadata(row.metadata) as AuditLogModel['metadata'],
    createdAt: row.createdAt.toISOString(),
  };
}
