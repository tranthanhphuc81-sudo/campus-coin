import { randomUUID } from "node:crypto";

import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import helmet from "helmet";

import { config } from "./config/env.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import { requireAuth } from "./middlewares/auth.js";
import { AppError, notFound, rateLimited } from "./lib/problem.js";
import { prisma } from "./lib/prisma.js";
import { registerBudgetAlertHandler } from "./events/handlers/budgetAlert.js";
import { registerAiLearningHandler } from "./events/handlers/aiLearning.js";
import { meHandler, patchMeHandler } from "./modules/auth/controller.js";
import { updateProfileSchema } from "./modules/auth/schema.js";
import { adminAuthRouter, authRouter } from "./modules/auth/routes.js";
import { budgetsRouter } from "./modules/budgets/routes.js";
import { categoriesRouter } from "./modules/categories/routes.js";
import { notificationsRouter } from "./modules/notifications/routes.js";
import { recurringRulesRouter } from "./modules/recurring-rules/routes.js";
import { dashboardRouter, reportsRouter } from "./modules/analytics/routes.js";
import { transactionsRouter } from "./modules/transactions/routes.js";
import { aiRouter } from "./modules/ai/routes.js";
import { importsRouter } from "./modules/imports/routes.js";
import { insightsRouter } from "./modules/insights/routes.js";
import { validate } from "./middlewares/validate.js";

export function createApp() {
  registerBudgetAlertHandler();
  registerAiLearningHandler();

  const app = express();

  app.set("trust proxy", 1);

  app.use((req, res, next) => {
    const requestId = req.header("x-request-id") ?? randomUUID();
    req.requestId = requestId;
    res.setHeader("x-request-id", requestId);
    next();
  });

  app.use((req, _res, next) => {
    process.stdout.write(`[${req.requestId}] ${req.method} ${req.originalUrl}\n`);
    next();
  });

  app.use(helmet());

  const corsOrigins = [config.APP_URL, ...config.CORS_ORIGINS];
  app.use(
    cors({
      origin: corsOrigins,
      credentials: true,
    }),
  );

  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());

  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      max: 300,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => req.user?.id ?? ipKeyGenerator(req.ip ?? ""),
      handler: (_req, _res, next) => {
        next(rateLimited("Too many requests. Please try again in a minute."));
      },
    }),
  );

  const apiRouter = express.Router();

  apiRouter.get("/health/live", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  apiRouter.get("/health/ready", async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: "ok" });
  });

  apiRouter.use("/auth", authRouter);
  apiRouter.use("/admin/auth", adminAuthRouter);
  apiRouter.use("/categories", categoriesRouter);
  apiRouter.use("/transactions", transactionsRouter);
  apiRouter.use("/imports", importsRouter);
  apiRouter.use("/recurring-rules", recurringRulesRouter);
  apiRouter.use("/budgets", budgetsRouter);
  apiRouter.use("/notifications", notificationsRouter);
  apiRouter.use("/dashboard", dashboardRouter);
  apiRouter.use("/reports", reportsRouter);
  apiRouter.use("/ai", aiRouter);
  apiRouter.use("/insights", insightsRouter);
  apiRouter.get("/me", requireAuth, meHandler);
  apiRouter.patch("/me", requireAuth, validate({ body: updateProfileSchema }), patchMeHandler);

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.use("/api/v1", apiRouter);

  app.use((req, _res, next) => {
    next(notFound(`Route ${req.method} ${req.originalUrl} does not exist.`));
  });

  app.use(
    (error: unknown, _req: express.Request, _res: express.Response, next: express.NextFunction) => {
      if (error instanceof AppError) {
        next(error);
        return;
      }
      next(error);
    },
  );

  app.use(errorHandler);

  return app;
}
