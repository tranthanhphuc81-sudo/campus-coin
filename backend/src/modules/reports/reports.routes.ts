/**
 * reports.routes.ts
 * Router for `/api/v1/reports`: requires an authenticated student, the default authenticated
 * rate-limit preset (Table 46) on every route, plus the tighter `reportsShare` preset (5/day) on
 * the email-share endpoint specifically.
 * Main exports: reportsRouter
 * Spec: docs/spec/05b §5.8 · docs/spec/07 §7.3.3 · Table 46 (rate limits)
 */
import { Router } from 'express';
import {
  Role,
  reportCategoryBreakdownQuerySchema,
  reportDailyWeeklyQuerySchema,
  reportIncomeVsExpenseQuerySchema,
  reportMonthlyExportQuerySchema,
  reportShareSchema,
} from '@campuscoin/shared';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { RATE_LIMIT_PRESETS } from '../../middlewares/rateLimit.js';
import { validate } from '../../middlewares/validate.js';
import * as reportsController from './reports.controller.js';

/** Router mounted at `/api/v1/reports`. */
export const reportsRouter: Router = Router();

reportsRouter.use(authenticate, authorize(Role.STUDENT), ...RATE_LIMIT_PRESETS.authenticatedDefault);

reportsRouter.get('/category-breakdown', validate({ query: reportCategoryBreakdownQuerySchema }), reportsController.getCategoryBreakdown);
reportsRouter.get('/income-vs-expense', validate({ query: reportIncomeVsExpenseQuerySchema }), reportsController.getIncomeVsExpense);
reportsRouter.get('/daily-weekly', validate({ query: reportDailyWeeklyQuerySchema }), reportsController.getDailyWeekly);
reportsRouter.get(
  '/monthly/export',
  // B-M4: PDF rendering is CPU-bound; the general authenticatedDefault cap alone was not enough to
  // stop a DoS via repeated renders.
  ...RATE_LIMIT_PRESETS.reportsExport,
  validate({ query: reportMonthlyExportQuerySchema }),
  reportsController.getMonthlyExport,
);
reportsRouter.post(
  '/monthly/share',
  ...RATE_LIMIT_PRESETS.reportsShare,
  validate({ body: reportShareSchema }),
  reportsController.postMonthlyShare,
);
