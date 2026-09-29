/**
 * transactions.routes.ts
 * Router for `/api/v1/transactions`: every route requires an authenticated student, the default
 * authenticated rate-limit preset (Table 46), then (POST only) idempotency, then Zod validation.
 * Main exports: transactionsRouter
 * Spec: docs/spec/07 §7.3.2 (transactions) · Table 40 (idempotency) · Table 46 (rate limits)
 */
import { Router } from 'express';
import {
  Role,
  createTransactionSchema,
  listTransactionsQuerySchema,
  resolveFlagSchema,
  updateTransactionSchema,
  uuidParamSchema,
} from '@campuscoin/shared';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { idempotency } from '../../lib/idempotency.js';
import { RATE_LIMIT_PRESETS } from '../../middlewares/rateLimit.js';
import { validate } from '../../middlewares/validate.js';
import * as transactionsController from './transactions.controller.js';

/** Router mounted at `/api/v1/transactions`. */
export const transactionsRouter: Router = Router();

// authenticate/authorize run first so `idempotency`'s cache key (req.auth.userId) is always set.
transactionsRouter.use(authenticate, authorize(Role.STUDENT), ...RATE_LIMIT_PRESETS.authenticatedDefault);

transactionsRouter.get('/', validate({ query: listTransactionsQuerySchema }), transactionsController.listTransactions);

transactionsRouter.get('/:id', validate({ params: uuidParamSchema }), transactionsController.getTransaction);

transactionsRouter.post(
  '/',
  idempotency,
  validate({ body: createTransactionSchema }),
  transactionsController.createTransaction,
);

transactionsRouter.patch(
  '/:id',
  validate({ params: uuidParamSchema, body: updateTransactionSchema }),
  transactionsController.updateTransaction,
);

transactionsRouter.delete('/:id', validate({ params: uuidParamSchema }), transactionsController.deleteTransaction);

transactionsRouter.post(
  '/:id/restore',
  validate({ params: uuidParamSchema }),
  transactionsController.restoreTransaction,
);

transactionsRouter.get(
  '/:id/history',
  validate({ params: uuidParamSchema }),
  transactionsController.getTransactionHistory,
);

transactionsRouter.post(
  '/:id/resolve-flag',
  validate({ params: uuidParamSchema, body: resolveFlagSchema }),
  transactionsController.resolveFlag,
);
