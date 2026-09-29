/**
 * reports.controller.ts
 * HTTP <-> DTO glue for `/api/v1/reports`. Reads parsed input from `req.validated` and the
 * caller's identity from `req.auth`. All business logic lives in `reports.service.ts`.
 * Main exports: getCategoryBreakdown, getIncomeVsExpense, getDailyWeekly, getMonthlyExport,
 *   postMonthlyShare
 * Spec: docs/spec/05b §5.8 · docs/spec/07 §7.3.3
 */
import type { RequestHandler } from 'express';
import type {
  ReportCategoryBreakdownQueryInput,
  ReportDailyWeeklyQueryInput,
  ReportIncomeVsExpenseQueryInput,
  ReportMonthlyExportQueryInput,
  ReportShareInput,
} from '@campuscoin/shared';
import * as reportsService from './reports.service.js';

/** `GET /reports/category-breakdown?from&to&type&categoryId`. */
export const getCategoryBreakdown: RequestHandler = async (req, res) => {
  const query = req.validated?.query as ReportCategoryBreakdownQueryInput;
  const dto = await reportsService.categoryBreakdown(req.auth!.userId, query);
  res.status(200).json(dto);
};

/** `GET /reports/income-vs-expense?months=`. */
export const getIncomeVsExpense: RequestHandler = async (req, res) => {
  const query = req.validated?.query as ReportIncomeVsExpenseQueryInput;
  const dto = await reportsService.incomeVsExpense(req.auth!.userId, query);
  res.status(200).json(dto);
};

/** `GET /reports/daily-weekly?month=`. */
export const getDailyWeekly: RequestHandler = async (req, res) => {
  const query = req.validated?.query as ReportDailyWeeklyQueryInput;
  const dto = await reportsService.dailyWeekly(req.auth!.userId, query);
  res.status(200).json(dto);
};

/** `GET /reports/monthly/export?month=&format=pdf` — downloadable PDF (docs/spec/09 §9.10 headers). */
export const getMonthlyExport: RequestHandler = async (req, res) => {
  const query = req.validated?.query as ReportMonthlyExportQueryInput;
  const { filename, buffer } = await reportsService.monthlyExportPdf(req.auth!.userId, query);
  res.status(200);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(buffer);
};

/** `POST /reports/monthly/share` — enqueues the PDF as an email attachment; 202 (async send). */
export const postMonthlyShare: RequestHandler = async (req, res) => {
  const input = req.validated?.body as ReportShareInput;
  await reportsService.shareMonthly(req.auth!.userId, input, { ip: req.ip, userAgent: req.get('user-agent') });
  res.status(202).json({ status: 'queued' });
};
