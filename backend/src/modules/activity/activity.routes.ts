/**
 * activity.routes.ts
 * Router for `/api/v1/activity`: the single `GET /recent` endpoint behind an authenticated
 * student and the default authenticated rate-limit preset (Table 46).
 * Main exports: activityRouter
 * Spec: docs/spec/05c §5.14 · docs/spec/07 §7.3.3 · Table 46 (rate limits)
 */
import { Router } from 'express';
import { Role, recentActivityQuerySchema } from '@campuscoin/shared';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { RATE_LIMIT_PRESETS } from '../../middlewares/rateLimit.js';
import { validate } from '../../middlewares/validate.js';
import * as activityController from './activity.controller.js';

/** Router mounted at `/api/v1/activity`. */
export const activityRouter: Router = Router();

activityRouter.use(authenticate, authorize(Role.STUDENT), ...RATE_LIMIT_PRESETS.authenticatedDefault);

activityRouter.get('/recent', validate({ query: recentActivityQuerySchema }), activityController.listRecentActivity);
