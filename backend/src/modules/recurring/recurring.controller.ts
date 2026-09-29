/**
 * recurring.controller.ts
 * HTTP <-> DTO glue for `/api/v1/recurring-rules`. Reads parsed input from `req.validated` and the
 * caller's identity from `req.auth`. All business logic lives in `recurring.service.ts`.
 * Main exports: listRecurringRules, createRecurringRule, updateRecurringRule, deleteRecurringRule
 * Spec: docs/spec/07 §7.3.2 (recurring rules)
 */
import type { CreateRecurringRuleInput, IntIdParamInput, UpdateRecurringRuleInput } from '@campuscoin/shared';
import type { RequestHandler } from 'express';
import * as recurringService from './recurring.service.js';

/** `GET /recurring-rules` — every rule the caller owns. */
export const listRecurringRules: RequestHandler = async (req, res) => {
  const rules = await recurringService.list(req.auth!.userId);
  res.status(200).json(rules);
};

/** `POST /recurring-rules` — creates a recurring rule. */
export const createRecurringRule: RequestHandler = async (req, res) => {
  const body = req.validated?.body as CreateRecurringRuleInput;
  const created = await recurringService.create(req.auth!.userId, body);
  res.status(201).json(created);
};

/** `PATCH /recurring-rules/:id` — partial update of one of the caller's own rules. */
export const updateRecurringRule: RequestHandler = async (req, res) => {
  const params = req.validated?.params as IntIdParamInput;
  const body = req.validated?.body as UpdateRecurringRuleInput;
  const updated = await recurringService.update(req.auth!.userId, params.id, body);
  res.status(200).json(updated);
};

/** `DELETE /recurring-rules/:id` — hard-deletes one of the caller's own rules. */
export const deleteRecurringRule: RequestHandler = async (req, res) => {
  const params = req.validated?.params as IntIdParamInput;
  await recurringService.remove(req.auth!.userId, params.id);
  res.status(204).end();
};
