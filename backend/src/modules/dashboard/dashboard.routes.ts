/**
 * dashboard.routes.ts
 * Router for `/api/v1/dashboard`: requires an authenticated student, the default authenticated
 * rate-limit preset (Table 46), then Zod validation.
 * Main exports: dashboardRouter
 * Spec: docs/spec/05b §5.7 (dashboard widgets) · docs/spec/07 §7.3.3 · Table 46 (rate limits)
 */
import { Router } from 'express';
import { Role, dashboardSummaryQuerySchema } from '@campuscoin/shared';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { RATE_LIMIT_PRESETS } from '../../middlewares/rateLimit.js';
import { validate } from '../../middlewares/validate.js';
import * as dashboardController from './dashboard.controller.js';

/** Router mounted at `/api/v1/dashboard`. */
export const dashboardRouter: Router = Router();

dashboardRouter.use(authenticate, authorize(Role.STUDENT), ...RATE_LIMIT_PRESETS.authenticatedDefault);

dashboardRouter.get('/summary', validate({ query: dashboardSummaryQuerySchema }), dashboardController.getSummary);
