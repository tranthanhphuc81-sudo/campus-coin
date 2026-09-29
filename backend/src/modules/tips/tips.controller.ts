/**
 * tips.controller.ts
 * HTTP <-> DTO glue for `/api/v1/tips`. Reads parsed input from `req.validated` and the caller's
 * identity from `req.auth`. All business logic lives in `tips.service.ts`.
 * Main exports: listTips, pinTip, unpinTip, dismissTip
 * Spec: docs/spec/05b §5.10 · docs/spec/07 §7.3.3
 */
import type { RequestHandler } from 'express';
import type { BigIntIdParamInput } from './tips.schema.js';
import * as tipsService from './tips.service.js';

/** `GET /tips` — the caller's current-period tips, pinned first then score descending. */
export const listTips: RequestHandler = async (req, res) => {
  const dto = await tipsService.listCurrentPeriod(req.auth!.userId);
  res.status(200).json(dto);
};

/** `POST /tips/:id/pin`. */
export const pinTip: RequestHandler = async (req, res) => {
  const params = req.validated?.params as BigIntIdParamInput;
  const dto = await tipsService.pin(req.auth!.userId, params.id);
  res.status(200).json(dto);
};

/** `POST /tips/:id/unpin`. */
export const unpinTip: RequestHandler = async (req, res) => {
  const params = req.validated?.params as BigIntIdParamInput;
  const dto = await tipsService.unpin(req.auth!.userId, params.id);
  res.status(200).json(dto);
};

/** `POST /tips/:id/dismiss`. */
export const dismissTip: RequestHandler = async (req, res) => {
  const params = req.validated?.params as BigIntIdParamInput;
  const dto = await tipsService.dismiss(req.auth!.userId, params.id);
  res.status(200).json(dto);
};
