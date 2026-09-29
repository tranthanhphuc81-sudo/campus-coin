/**
 * admin-audit.controller.ts
 * HTTP <-> DTO glue for `/api/v1/admin/audit-logs` (read-only). All logic lives in
 * `admin-audit.service.ts`.
 * Main exports: listAdminAuditLogs
 * Spec: docs/spec/07 §7.3.4 (admin audit logs)
 */
import type { AdminAuditLogQueryInput } from '@campuscoin/shared';
import type { RequestHandler } from 'express';
import * as adminAuditService from './admin-audit.service.js';

/** `GET /admin/audit-logs`. */
export const listAdminAuditLogs: RequestHandler = async (req, res) => {
  const query = req.validated?.query as AdminAuditLogQueryInput;
  const result = await adminAuditService.list(query);
  res.status(200).json(result);
};
