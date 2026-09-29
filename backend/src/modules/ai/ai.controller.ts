/**
 * ai.controller.ts
 * HTTP <-> DTO glue for `/api/v1/ai`. Reads parsed input from `req.validated` and the caller's
 * identity from `req.auth`. All business logic lives in `ai.service.ts`.
 * Main exports: suggestCategory, submitFeedback
 * Spec: docs/spec/05b §5.6 (AI categorization)
 */
import type { AiFeedbackInput, CategorizeSuggestInput } from '@campuscoin/shared';
import type { RequestHandler } from 'express';
import * as aiService from './ai.service.js';

/** `POST /ai/categorize/suggest` — a category suggestion, or `null` in the body when none matched. */
export const suggestCategory: RequestHandler = async (req, res) => {
  const body = req.validated?.body as CategorizeSuggestInput;
  const suggestion = await aiService.suggest(req.auth!.userId, body);
  res.status(200).json(suggestion);
};

/** `POST /ai/feedback` — teaches tier-1 personal rules from the user's category choice. */
export const submitFeedback: RequestHandler = async (req, res) => {
  const body = req.validated?.body as AiFeedbackInput;
  await aiService.recordFeedback(req.auth!.userId, body);
  res.status(204).end();
};
