import { Router } from "express";

import { requireAuth } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
import {
  createRecurringRuleHandler,
  deleteRecurringRuleHandler,
  listRecurringRulesHandler,
  patchRecurringRuleHandler,
} from "./controller.js";
import {
  createRecurringRuleBodySchema,
  recurringRuleIdParamsSchema,
  updateRecurringRuleBodySchema,
} from "./schema.js";

export const recurringRulesRouter = Router();

recurringRulesRouter.use(requireAuth);
recurringRulesRouter.get("/", listRecurringRulesHandler);
recurringRulesRouter.post("/", validate({ body: createRecurringRuleBodySchema }), createRecurringRuleHandler);
recurringRulesRouter.patch(
  "/:id",
  validate({ params: recurringRuleIdParamsSchema, body: updateRecurringRuleBodySchema }),
  patchRecurringRuleHandler,
);
recurringRulesRouter.delete(
  "/:id",
  validate({ params: recurringRuleIdParamsSchema }),
  deleteRecurringRuleHandler,
);
