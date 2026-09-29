/**
 * categories.routes.ts
 * Router for `/api/v1/categories`: every route requires an authenticated student, the default
 * authenticated rate-limit preset (Table 46), then Zod validation.
 * Main exports: categoriesRouter
 * Spec: docs/spec/07 §7.3.2 (categories) · Table 46 (rate limits)
 */
import { Router } from 'express';
import {
  Role,
  createCategorySchema,
  deleteCategoryQuerySchema,
  intIdParamSchema,
  listCategoriesQuerySchema,
  updateCategorySchema,
} from '@campuscoin/shared';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { RATE_LIMIT_PRESETS } from '../../middlewares/rateLimit.js';
import { validate } from '../../middlewares/validate.js';
import * as categoriesController from './categories.controller.js';

/** Router mounted at `/api/v1/categories`. */
export const categoriesRouter: Router = Router();

categoriesRouter.use(authenticate, authorize(Role.STUDENT), ...RATE_LIMIT_PRESETS.authenticatedDefault);

categoriesRouter.get('/', validate({ query: listCategoriesQuerySchema }), categoriesController.listCategories);

categoriesRouter.post('/', validate({ body: createCategorySchema }), categoriesController.createCategory);

categoriesRouter.patch(
  '/:id',
  validate({ params: intIdParamSchema, body: updateCategorySchema }),
  categoriesController.updateCategory,
);

categoriesRouter.delete(
  '/:id',
  validate({ params: intIdParamSchema, query: deleteCategoryQuerySchema }),
  categoriesController.deleteCategory,
);
