/**
 * budgets.routes.ts
 * Router for `/api/v1/budgets`: every route requires an authenticated student, the default
 * authenticated rate-limit preset (Table 46), then Zod validation. `PUT /budgets` also gets the
 * idempotency middleware (bulk upsert is a good idempotency candidate, same as `POST /transactions`).
 * Main exports: budgetsRouter
 * Spec: docs/spec/05c §5.11 (budgets & alerts) · docs/spec/07 §7.3.3 · Table 46 (rate limits)
 */
import { Router } from 'express';
import {
  Role,
  copyPreviousBudgetsSchema,
  intIdParamSchema,
  listBudgetsQuerySchema,
  upsertBudgetsSchema,
} from '@campuscoin/shared';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { idempotency } from '../../lib/idempotency.js';
import { RATE_LIMIT_PRESETS } from '../../middlewares/rateLimit.js';
import { validate } from '../../middlewares/validate.js';
import * as budgetsController from './budgets.controller.js';

/** Router mounted at `/api/v1/budgets`. */
export const budgetsRouter: Router = Router();

budgetsRouter.use(authenticate, authorize(Role.STUDENT), ...RATE_LIMIT_PRESETS.authenticatedDefault);

budgetsRouter.get('/', validate({ query: listBudgetsQuerySchema }), budgetsController.listBudgets);

budgetsRouter.put('/', idempotency, validate({ body: upsertBudgetsSchema }), budgetsController.upsertBudgets);

budgetsRouter.post(
  '/copy-previous',
  validate({ body: copyPreviousBudgetsSchema }),
  budgetsController.copyPreviousBudgets,
);

budgetsRouter.delete('/:id', validate({ params: intIdParamSchema }), budgetsController.deleteBudget);
