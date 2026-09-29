/**
 * admin-announcements.routes.ts
 * Router for `/api/v1/admin/announcements`. Mounted AFTER `app.ts`'s blanket
 * `authenticate, authorize(Role.ADMIN)` guard on `/api/v1/admin` — this router only adds the
 * default authenticated rate-limit preset (Table 46), never `authenticate`/`authorize` itself.
 * Main exports: adminAnnouncementsRouter
 * Spec: docs/spec/05c §5.13 · docs/spec/07 §7.3.4 · Table 46 (rate limits)
 */
import { Router } from 'express';
import { createAnnouncementSchema, intIdParamSchema, updateAnnouncementSchema } from '@campuscoin/shared';
import { RATE_LIMIT_PRESETS } from '../../middlewares/rateLimit.js';
import { validate } from '../../middlewares/validate.js';
import * as adminAnnouncementsController from './admin-announcements.controller.js';

/** Router mounted at `/api/v1/admin/announcements`. */
export const adminAnnouncementsRouter: Router = Router();

adminAnnouncementsRouter.use(...RATE_LIMIT_PRESETS.authenticatedDefault);

adminAnnouncementsRouter.get('/', adminAnnouncementsController.listAdminAnnouncements);

adminAnnouncementsRouter.post(
  '/',
  validate({ body: createAnnouncementSchema }),
  adminAnnouncementsController.createAdminAnnouncement,
);

adminAnnouncementsRouter.patch(
  '/:id',
  validate({ params: intIdParamSchema, body: updateAnnouncementSchema }),
  adminAnnouncementsController.updateAdminAnnouncement,
);

adminAnnouncementsRouter.delete(
  '/:id',
  validate({ params: intIdParamSchema }),
  adminAnnouncementsController.deleteAdminAnnouncement,
);
