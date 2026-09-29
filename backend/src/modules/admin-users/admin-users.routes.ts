/**
 * admin-users.routes.ts
 * Router for `/api/v1/admin/users`. Mounted AFTER `app.ts`'s blanket
 * `authenticate, authorize(Role.ADMIN)` guard on `/api/v1/admin` — this router only adds the
 * default authenticated rate-limit preset (Table 46), never `authenticate`/`authorize` itself.
 * Main exports: adminUsersRouter
 * Spec: docs/spec/05c §5.13 · docs/spec/07 §7.3.4 · Table 46 (rate limits)
 */
import { Router } from 'express';
import { listAdminUsersQuerySchema, uuidParamSchema } from '@campuscoin/shared';
import { RATE_LIMIT_PRESETS } from '../../middlewares/rateLimit.js';
import { validate } from '../../middlewares/validate.js';
import * as adminUsersController from './admin-users.controller.js';

/** Router mounted at `/api/v1/admin/users`. */
export const adminUsersRouter: Router = Router();

adminUsersRouter.use(...RATE_LIMIT_PRESETS.authenticatedDefault);

adminUsersRouter.get('/', validate({ query: listAdminUsersQuerySchema }), adminUsersController.listAdminUsers);

adminUsersRouter.get('/:id', validate({ params: uuidParamSchema }), adminUsersController.getAdminUser);

adminUsersRouter.post('/:id/disable', validate({ params: uuidParamSchema }), adminUsersController.disableAdminUser);

adminUsersRouter.post('/:id/enable', validate({ params: uuidParamSchema }), adminUsersController.enableAdminUser);

adminUsersRouter.post(
  '/:id/send-reset',
  // Fix 3: in addition to the router-wide `authenticatedDefault` above, a per-TARGET limit so one
  // admin session cannot spam a single student with reset-link emails.
  ...RATE_LIMIT_PRESETS.adminSendReset,
  validate({ params: uuidParamSchema }),
  adminUsersController.sendResetLinkAdminUser,
);
