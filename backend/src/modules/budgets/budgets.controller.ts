/**
 * budgets.controller.ts
 * HTTP <-> DTO glue for `/api/v1/budgets`. Reads parsed input from `req.validated` and the
 * caller's identity from `req.auth`. All business logic lives in `budgets.service.ts`.
 * Main exports: listBudgets, upsertBudgets, copyPreviousBudgets, deleteBudget
 * Spec: docs/spec/05c §5.11 (budgets & alerts) · docs/spec/07 §7.3.3
 */
import type { RequestHandler } from 'express';
import type {
  CopyPreviousBudgetsInput,
  IntIdParamInput,
  ListBudgetsQueryInput,
  UpsertBudgetsInput,
} from '@campuscoin/shared';
import * as budgetsService from './budgets.service.js';

/** `GET /budgets?month=` — every budget the caller has for one month, with computed consumption. */
export const listBudgets: RequestHandler = async (req, res) => {
  const query = req.validated?.query as ListBudgetsQueryInput;
  const budgets = await budgetsService.list(req.auth!.userId, query);
  res.status(200).json(budgets);
};

/** `PUT /budgets` — bulk upsert every category's budget for one month. */
export const upsertBudgets: RequestHandler = async (req, res) => {
  const body = req.validated?.body as UpsertBudgetsInput;
  const budgets = await budgetsService.upsertMany(req.auth!.userId, body);
  res.status(200).json(budgets);
};

/** `POST /budgets/copy-previous` — copies the prior month's budgets into `body.month`. */
export const copyPreviousBudgets: RequestHandler = async (req, res) => {
  const body = req.validated?.body as CopyPreviousBudgetsInput;
  const budgets = await budgetsService.copyPrevious(req.auth!.userId, body);
  res.status(200).json(budgets);
};

/** `DELETE /budgets/:id` — hard-deletes one of the caller's own budgets. */
export const deleteBudget: RequestHandler = async (req, res) => {
  const params = req.validated?.params as IntIdParamInput;
  await budgetsService.remove(req.auth!.userId, params.id);
  res.status(204).end();
};
