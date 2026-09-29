/**
 * insights.controller.ts
 * HTTP <-> DTO glue for `/api/v1/insights`. Reads parsed input from `req.validated` and the
 * caller's identity from `req.auth`. All business logic lives in `insights.service.ts`.
 * Main exports: list, getByMonth, regenerate
 * Spec: docs/spec/05b §5.9 · docs/spec/07 §7.3.3
 */
import type { RequestHandler } from 'express';
import type { InsightMonthParamInput, ListInsightsQueryInput } from '@campuscoin/shared';
import * as insightsService from './insights.service.js';

/** `GET /insights?page=&limit=`. */
export const list: RequestHandler = async (req, res) => {
  const query = req.validated?.query as ListInsightsQueryInput;
  const dto = await insightsService.list(req.auth!.userId, query);
  res.status(200).json(dto);
};

/** `GET /insights/:month`. */
export const getByMonth: RequestHandler = async (req, res) => {
  const params = req.validated?.params as InsightMonthParamInput;
  const dto = await insightsService.getByMonth(req.auth!.userId, params.month);
  res.status(200).json(dto);
};

/** `POST /insights/:month/regenerate` — enqueues generation; `202` (async work). */
export const regenerate: RequestHandler = async (req, res) => {
  const params = req.validated?.params as InsightMonthParamInput;
  await insightsService.regenerate(req.auth!.userId, params.month);
  res.status(202).json({});
};
