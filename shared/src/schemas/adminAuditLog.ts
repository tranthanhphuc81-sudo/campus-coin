/**
 * adminAuditLog.ts
 * Zod schema + DTO for the admin portal's read-only audit-log viewer (`GET /admin/audit-logs`).
 * Main exports: adminAuditLogQuerySchema + inferred input type, AdminAuditLogDto
 * Spec: docs/spec/09 §9.12 (Table 58) · docs/spec/07 §7.3.4
 */
import { z } from 'zod';
import { PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX } from '../constants.js';

/** Query of `GET /admin/audit-logs`. */
export const adminAuditLogQuerySchema = z
  .object({
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
    action: z.string().trim().min(1).max(80).optional(),
    actorId: z.string().trim().min(1).max(64).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(PAGE_SIZE_DEFAULT),
  })
  .strict();
/** Inferred input type of {@link adminAuditLogQuerySchema}. */
export type AdminAuditLogQueryInput = z.infer<typeof adminAuditLogQuerySchema>;

/** One row of `GET /admin/audit-logs`. `id` is a BigInt serialized as a string. */
export interface AdminAuditLogDto {
  id: string;
  actorId: string | null;
  actorRole: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  ipHash: string | null;
  userAgent: string | null;
  metadata: unknown;
  createdAt: string;
}
