/**
 * admin-auth.routes.ts
 * Router for `/api/v1/admin/auth/*`: wires Zod validation and its own rate-limit presets (Table
 * 46 — separate Redis key prefixes from student login) onto the admin-auth.controller handlers.
 * Mounted in app.ts behind `corsWithCredentials` and ahead of the blanket
 * `authenticate` + `authorize(Role.ADMIN)` guard on the rest of `/admin/*`.
 * Main exports: adminAuthRouter
 * Spec: docs/spec/07 §7.3.1 (Table 46 rate limits) · docs/spec/09 §9.5 (MFA row)
 */
import { adminLoginSchema, mfaVerifySchema } from '@campuscoin/shared';
import { Router } from 'express';
import { RATE_LIMIT_PRESETS } from '../../middlewares/rateLimit.js';
import { validate } from '../../middlewares/validate.js';
import * as adminAuthController from './admin-auth.controller.js';

/** Router mounted at `/api/v1/admin/auth`. */
export const adminAuthRouter: Router = Router();

adminAuthRouter.post(
  '/login',
  ...RATE_LIMIT_PRESETS.adminAuthLogin,
  validate({ body: adminLoginSchema }),
  adminAuthController.login,
);

adminAuthRouter.post(
  '/mfa/verify',
  ...RATE_LIMIT_PRESETS.adminMfaVerify,
  validate({ body: mfaVerifySchema }),
  adminAuthController.mfaVerify,
);
