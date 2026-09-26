import { Router } from "express";

import { requireAuth } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
import {
  getInsightByMonthHandler,
  listInsightsHandler,
  regenerateInsightHandler,
} from "./controller.js";
import { insightMonthParamsSchema } from "./schema.js";

export const insightsRouter = Router();

insightsRouter.use(requireAuth);
insightsRouter.get("/", listInsightsHandler);
insightsRouter.get(
  "/:month",
  validate({ params: insightMonthParamsSchema }),
  getInsightByMonthHandler,
);
insightsRouter.post(
  "/:month/regenerate",
  validate({ params: insightMonthParamsSchema }),
  regenerateInsightHandler,
);
