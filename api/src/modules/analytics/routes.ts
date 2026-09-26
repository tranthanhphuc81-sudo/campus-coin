import { Router } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

import { requireAuth } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
import { rateLimited } from "../../lib/problem.js";
import {
  categoryBreakdownHandler,
  dailyWeeklyHandler,
  dashboardSummaryHandler,
  incomeVsExpenseHandler,
  monthlyExportHandler,
  monthlyShareHandler,
} from "./controller.js";
import {
  categoryBreakdownQuerySchema,
  dailyWeeklyQuerySchema,
  dashboardSummaryQuerySchema,
  incomeVsExpenseQuerySchema,
  monthlyExportQuerySchema,
  monthlyShareBodySchema,
} from "./schema.js";

export const dashboardRouter = Router();
export const reportsRouter = Router();

// Design 7.4: /reports/monthly/share is limited to 5 emails/day per user.
const monthlyShareRateLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? ipKeyGenerator(req.ip ?? ""),
  handler: (_req, _res, next) => {
    next(rateLimited("You can share at most 5 reports by email per day."));
  },
});

dashboardRouter.use(requireAuth);
dashboardRouter.get(
  "/summary",
  validate({ query: dashboardSummaryQuerySchema }),
  dashboardSummaryHandler,
);

reportsRouter.use(requireAuth);
reportsRouter.get(
  "/category-breakdown",
  validate({ query: categoryBreakdownQuerySchema }),
  categoryBreakdownHandler,
);
reportsRouter.get(
  "/income-vs-expense",
  validate({ query: incomeVsExpenseQuerySchema }),
  incomeVsExpenseHandler,
);
reportsRouter.get("/daily-weekly", validate({ query: dailyWeeklyQuerySchema }), dailyWeeklyHandler);
reportsRouter.get(
  "/monthly/export",
  validate({ query: monthlyExportQuerySchema }),
  monthlyExportHandler,
);
reportsRouter.post(
  "/monthly/share",
  monthlyShareRateLimiter,
  validate({ body: monthlyShareBodySchema }),
  monthlyShareHandler,
);
