/**
 * insights.routes.ts
 * Router for `/api/v1/insights`: requires an authenticated student, the default authenticated
 * rate-limit preset (Table 46) on every route, plus the tighter `insightsRegenerate` preset
 * (3/30days, keyed by userId+month) on the regenerate endpoint specifically.
 * Main exports: insightsRouter
 * Spec: docs/spec/05b §5.9 · docs/spec/07 §7.3.3 · Table 46 (rate limits)
 */
import { Router } from 'express';
import { Role, insightMonthParamSchema, listInsightsQuerySchema } from '@campuscoin/shared';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { RATE_LIMIT_PRESETS } from '../../middlewares/rateLimit.js';
import { validate } from '../../middlewares/validate.js';
import * as insightsController from './insights.controller.js';

/** Router mounted at `/api/v1/insights`. */
export const insightsRouter: Router = Router();

insightsRouter.use(authenticate, authorize(Role.STUDENT), ...RATE_LIMIT_PRESETS.authenticatedDefault);

insightsRouter.get('/', validate({ query: listInsightsQuerySchema }), insightsController.list);
insightsRouter.get('/:month', validate({ params: insightMonthParamSchema }), insightsController.getByMonth);
insightsRouter.post(
  '/:month/regenerate',
  ...RATE_LIMIT_PRESETS.insightsRegenerate,
  validate({ params: insightMonthParamSchema }),
  insightsController.regenerate,
);
