/**
 * forecast.controller.ts
 * HTTP <-> DTO glue for `/api/v1/forecast`. Reads the caller's identity from `req.auth`. All
 * business logic lives in `forecast.service.ts`.
 * Main exports: getNextMonth
 * Spec: docs/spec/05c §5.14
 */
import type { RequestHandler } from 'express';
import * as forecastService from './forecast.service.js';

/** `GET /forecast/next-month` — the caller's next-month spending/income forecast. */
export const getNextMonth: RequestHandler = async (req, res) => {
  const dto = await forecastService.nextMonth(req.auth!.userId);
  res.status(200).json(dto);
};
