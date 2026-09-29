/**
 * admin-tip-templates.routes.ts
 * Router for `/api/v1/admin/tip-templates`. Mounted AFTER `app.ts`'s blanket
 * `authenticate, authorize(Role.ADMIN)` guard on `/api/v1/admin` — this router only adds the
 * default authenticated rate-limit preset (Table 46), never `authenticate`/`authorize` itself.
 * Main exports: adminTipTemplatesRouter
 * Spec: docs/spec/05b §5.10 · docs/spec/07 §7.3.4 · Table 46 (rate limits)
 */
import { Router } from 'express';
import { createTipTemplateSchema, intIdParamSchema, previewTipTemplateSchema, updateTipTemplateSchema } from '@campuscoin/shared';
import { RATE_LIMIT_PRESETS } from '../../middlewares/rateLimit.js';
import { validate } from '../../middlewares/validate.js';
import * as adminTipTemplatesController from './admin-tip-templates.controller.js';

/** Router mounted at `/api/v1/admin/tip-templates`. */
export const adminTipTemplatesRouter: Router = Router();

adminTipTemplatesRouter.use(...RATE_LIMIT_PRESETS.authenticatedDefault);

adminTipTemplatesRouter.get('/', adminTipTemplatesController.listAdminTipTemplates);

adminTipTemplatesRouter.post(
  '/',
  validate({ body: createTipTemplateSchema }),
  adminTipTemplatesController.createAdminTipTemplate,
);

adminTipTemplatesRouter.post(
  '/preview',
  validate({ body: previewTipTemplateSchema }),
  adminTipTemplatesController.previewAdminTipTemplate,
);

adminTipTemplatesRouter.patch(
  '/:id',
  validate({ params: intIdParamSchema, body: updateTipTemplateSchema }),
  adminTipTemplatesController.updateAdminTipTemplate,
);

adminTipTemplatesRouter.delete(
  '/:id',
  validate({ params: intIdParamSchema }),
  adminTipTemplatesController.deleteAdminTipTemplate,
);
