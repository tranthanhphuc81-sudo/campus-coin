/**
 * forecast.routes.ts
 * Router for `/api/v1/forecast`: the single `GET /next-month` endpoint behind an authenticated
 * student and the default authenticated rate-limit preset (Table 46). No caching this phase (the
 * queries are small/indexed) — a documented known gap, see PROGRESS.md.
 * Main exports: forecastRouter
 * Spec: docs/spec/05c §5.14 · docs/spec/07 §7.3.3 · Table 46 (rate limits)
 */
import { Router } from 'express';
import { Role, forecastQuerySchema } from '@campuscoin/shared';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { RATE_LIMIT_PRESETS } from '../../middlewares/rateLimit.js';
import { validate } from '../../middlewares/validate.js';
import * as forecastController from './forecast.controller.js';

/** Router mounted at `/api/v1/forecast`. */
export const forecastRouter: Router = Router();

forecastRouter.use(authenticate, authorize(Role.STUDENT), ...RATE_LIMIT_PRESETS.authenticatedDefault);

forecastRouter.get('/next-month', validate({ query: forecastQuerySchema }), forecastController.getNextMonth);
