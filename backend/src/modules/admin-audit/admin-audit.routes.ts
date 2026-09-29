/**
 * admin-audit.routes.ts
 * Router for `/api/v1/admin/audit-logs` (read-only). Mounted AFTER `app.ts`'s blanket
 * `authenticate, authorize(Role.ADMIN)` guard on `/api/v1/admin` — this router only adds the
 * default authenticated rate-limit preset (Table 46), never `authenticate`/`authorize` itself.
 * Main exports: adminAuditRouter
 * Spec: docs/spec/09 §9.12 · docs/spec/07 §7.3.4 · Table 46 (rate limits)
 */
import { Router } from 'express';
import { adminAuditLogQuerySchema } from '@campuscoin/shared';
import { RATE_LIMIT_PRESETS } from '../../middlewares/rateLimit.js';
import { validate } from '../../middlewares/validate.js';
import * as adminAuditController from './admin-audit.controller.js';

/** Router mounted at `/api/v1/admin/audit-logs`. */
export const adminAuditRouter: Router = Router();

adminAuditRouter.use(...RATE_LIMIT_PRESETS.authenticatedDefault);

adminAuditRouter.get('/', validate({ query: adminAuditLogQuerySchema }), adminAuditController.listAdminAuditLogs);
