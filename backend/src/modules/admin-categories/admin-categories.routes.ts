/**
 * admin-categories.routes.ts
 * Router for `/api/v1/admin/categories`. Mounted AFTER `app.ts`'s blanket
 * `authenticate, authorize(Role.ADMIN)` guard on `/api/v1/admin` — this router only adds the
 * default authenticated rate-limit preset (Table 46), never `authenticate`/`authorize` itself.
 * Main exports: adminCategoriesRouter
 * Spec: docs/spec/05c §5.13 · docs/spec/07 §7.3.4 · Table 46 (rate limits)
 */
import { Router } from 'express';
import { z } from 'zod';
import { TransactionType, createCategorySchema, intIdParamSchema, updateCategorySchema } from '@campuscoin/shared';
import { RATE_LIMIT_PRESETS } from '../../middlewares/rateLimit.js';
import { validate } from '../../middlewares/validate.js';
import * as adminCategoriesController from './admin-categories.controller.js';

/** Query of `GET /admin/categories`. */
const listAdminCategoriesQuerySchema = z.object({ type: z.enum(TransactionType).optional() }).strict();

/** Query of `DELETE /admin/categories/:id` — mirrors `deleteCategoryQuerySchema`'s `archive` field. */
const deleteAdminCategoryQuerySchema = z
  .object({ archive: z.enum(['true', 'false']).optional().transform((v) => v === 'true') })
  .strict();

/** Router mounted at `/api/v1/admin/categories`. */
export const adminCategoriesRouter: Router = Router();

adminCategoriesRouter.use(...RATE_LIMIT_PRESETS.authenticatedDefault);

adminCategoriesRouter.get(
  '/',
  validate({ query: listAdminCategoriesQuerySchema }),
  adminCategoriesController.listAdminCategories,
);

adminCategoriesRouter.post('/', validate({ body: createCategorySchema }), adminCategoriesController.createAdminCategory);

adminCategoriesRouter.patch(
  '/:id',
  validate({ params: intIdParamSchema, body: updateCategorySchema }),
  adminCategoriesController.updateAdminCategory,
);

adminCategoriesRouter.delete(
  '/:id',
  validate({ params: intIdParamSchema, query: deleteAdminCategoryQuerySchema }),
  adminCategoriesController.deleteAdminCategory,
);
