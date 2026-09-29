/**
 * dashboard.controller.ts
 * HTTP <-> DTO glue for `/api/v1/dashboard`. Reads parsed input from `req.validated` and the
 * caller's identity from `req.auth`. All business logic lives in `dashboard.service.ts`.
 * Main exports: getSummary
 * Spec: docs/spec/05b §5.7 (dashboard widgets) · docs/spec/07 §7.3.3
 */
import type { RequestHandler } from 'express';
import type { DashboardSummaryQueryInput } from '@campuscoin/shared';
import * as dashboardService from './dashboard.service.js';

/** `GET /dashboard/summary?month=` — the single aggregate call backing every dashboard widget. */
export const getSummary: RequestHandler = async (req, res) => {
  const query = req.validated?.query as DashboardSummaryQueryInput;
  const summary = await dashboardService.summary(req.auth!.userId, query);
  res.status(200).json(summary);
};
