/**
 * recurring.routes.ts
 * Router for `/api/v1/recurring-rules`: every route requires an authenticated student, the
 * default authenticated rate-limit preset (Table 46), then Zod validation.
 * Main exports: recurringRouter
 * Spec: docs/spec/07 §7.3.2 (recurring rules) · Table 46 (rate limits)
 */
import { Router } from 'express';
import { Role, createRecurringRuleSchema, intIdParamSchema, updateRecurringRuleSchema } from '@campuscoin/shared';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { RATE_LIMIT_PRESETS } from '../../middlewares/rateLimit.js';
import { validate } from '../../middlewares/validate.js';
import * as recurringController from './recurring.controller.js';

/** Router mounted at `/api/v1/recurring-rules`. */
export const recurringRouter: Router = Router();

recurringRouter.use(authenticate, authorize(Role.STUDENT), ...RATE_LIMIT_PRESETS.authenticatedDefault);

recurringRouter.get('/', recurringController.listRecurringRules);

recurringRouter.post('/', validate({ body: createRecurringRuleSchema }), recurringController.createRecurringRule);

recurringRouter.patch(
  '/:id',
  validate({ params: intIdParamSchema, body: updateRecurringRuleSchema }),
  recurringController.updateRecurringRule,
);

recurringRouter.delete('/:id', validate({ params: intIdParamSchema }), recurringController.deleteRecurringRule);
