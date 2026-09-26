import { Router } from "express";

import { requireAuth } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
import {
  createTransactionHandler,
  deleteTransactionHandler,
  listTransactionsHandler,
  patchTransactionHandler,
} from "./controller.js";
import {
  createTransactionBodySchema,
  listTransactionsQuerySchema,
  transactionIdParamsSchema,
  updateTransactionBodySchema,
} from "./schema.js";

export const transactionsRouter = Router();

transactionsRouter.use(requireAuth);
transactionsRouter.get(
  "/",
  validate({ query: listTransactionsQuerySchema }),
  listTransactionsHandler,
);
transactionsRouter.post(
  "/",
  validate({ body: createTransactionBodySchema }),
  createTransactionHandler,
);
transactionsRouter.patch(
  "/:id",
  validate({ params: transactionIdParamsSchema, body: updateTransactionBodySchema }),
  patchTransactionHandler,
);
transactionsRouter.delete(
  "/:id",
  validate({ params: transactionIdParamsSchema }),
  deleteTransactionHandler,
);
