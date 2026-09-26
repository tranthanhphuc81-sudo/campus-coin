import { Router } from "express";

import { requireAuth } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
import {
  copyPreviousBudgetsBodySchema,
  budgetIdParamsSchema,
  budgetsMonthQuerySchema,
  upsertBudgetsBodySchema,
} from "./schema.js";
import {
  copyPreviousBudgetsHandler,
  deleteBudgetHandler,
  listBudgetsHandler,
  upsertBudgetsHandler,
} from "./controller.js";

export const budgetsRouter = Router();

budgetsRouter.use(requireAuth);
budgetsRouter.get("/", validate({ query: budgetsMonthQuerySchema }), listBudgetsHandler);
budgetsRouter.put("/", validate({ body: upsertBudgetsBodySchema }), upsertBudgetsHandler);
budgetsRouter.post(
  "/copy-previous",
  validate({ body: copyPreviousBudgetsBodySchema }),
  copyPreviousBudgetsHandler,
);
budgetsRouter.delete("/:id", validate({ params: budgetIdParamsSchema }), deleteBudgetHandler);
