/**
 * transactions.controller.ts
 * HTTP <-> DTO glue for `/api/v1/transactions`. Reads parsed input from `req.validated` and the
 * caller's identity from `req.auth`. All business logic lives in `transactions.service.ts`.
 * Main exports: listTransactions, getTransaction, createTransaction, updateTransaction,
 *   deleteTransaction, restoreTransaction, getTransactionHistory, resolveFlag
 * Spec: docs/spec/07 §7.3.2 (transactions)
 */
import type {
  CreateTransactionInput,
  ListTransactionsQueryInput,
  ResolveFlagInput,
  UpdateTransactionInput,
  UuidParamInput,
} from '@campuscoin/shared';
import type { RequestHandler } from 'express';
import * as transactionsService from './transactions.service.js';

/** `GET /transactions` — filtered, sorted, paginated list of the caller's own transactions. */
export const listTransactions: RequestHandler = async (req, res) => {
  const query = req.validated?.query as ListTransactionsQueryInput;
  const result = await transactionsService.list(req.auth!.userId, query);
  res.status(200).json(result);
};

/** `GET /transactions/:id` — one active transaction owned by the caller. */
export const getTransaction: RequestHandler = async (req, res) => {
  const params = req.validated?.params as UuidParamInput;
  const txn = await transactionsService.get(req.auth!.userId, params.id);
  res.status(200).json(txn);
};

/** `POST /transactions` — creates a transaction. Idempotency is handled by upstream middleware. */
export const createTransaction: RequestHandler = async (req, res) => {
  const body = req.validated?.body as CreateTransactionInput;
  const created = await transactionsService.create(req.auth!.userId, body);
  res.status(201).json(created);
};

/** `PATCH /transactions/:id` — partial update with optimistic locking (BR-TX-05). */
export const updateTransaction: RequestHandler = async (req, res) => {
  const params = req.validated?.params as UuidParamInput;
  const body = req.validated?.body as UpdateTransactionInput;
  const updated = await transactionsService.update(req.auth!.userId, params.id, body);
  res.status(200).json(updated);
};

/** `DELETE /transactions/:id` — soft delete (BR-TX-07 trash). */
export const deleteTransaction: RequestHandler = async (req, res) => {
  const params = req.validated?.params as UuidParamInput;
  await transactionsService.remove(req.auth!.userId, params.id);
  res.status(204).end();
};

/** `POST /transactions/:id/restore` — restores a soft-deleted transaction from the trash. */
export const restoreTransaction: RequestHandler = async (req, res) => {
  const params = req.validated?.params as UuidParamInput;
  const restored = await transactionsService.restore(req.auth!.userId, params.id);
  res.status(200).json(restored);
};

/** `GET /transactions/:id/history` — full change history, oldest first (BR-TX-06). */
export const getTransactionHistory: RequestHandler = async (req, res) => {
  const params = req.validated?.params as UuidParamInput;
  const rows = await transactionsService.history(req.auth!.userId, params.id);
  res.status(200).json(rows);
};

/** `POST /transactions/:id/resolve-flag` — confirm/dismiss an anomaly or duplicate flag. */
export const resolveFlag: RequestHandler = async (req, res) => {
  const params = req.validated?.params as UuidParamInput;
  const body = req.validated?.body as ResolveFlagInput;
  const updated = await transactionsService.resolveFlag(req.auth!.userId, params.id, body);
  res.status(200).json(updated);
};
