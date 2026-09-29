/**
 * admin-stats.routes.ts
 * Router for `/api/v1/admin/stats`. Mounted AFTER `app.ts`'s blanket
 * `authenticate, authorize(Role.ADMIN)` guard on `/api/v1/admin` — this router only adds the
 * default authenticated rate-limit preset (Table 46), never `authenticate`/`authorize` itself.
 * Main exports: adminStatsRouter
 * Spec: docs/spec/05c §5.13 (Table 24) · docs/spec/07 §7.3.4 · Table 46 (rate limits)
 */
import { Router } from 'express';
import { RATE_LIMIT_PRESETS } from '../../middlewares/rateLimit.js';
import * as adminStatsController from './admin-stats.controller.js';

/** Router mounted at `/api/v1/admin/stats`. */
export const adminStatsRouter: Router = Router();

adminStatsRouter.use(...RATE_LIMIT_PRESETS.authenticatedDefault);

adminStatsRouter.get('/overview', adminStatsController.getAdminStatsOverview);

adminStatsRouter.get('/categories-usage', adminStatsController.getAdminCategoriesUsage);
