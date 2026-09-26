import type { Request, Response } from "express";

import { unauthenticated } from "../../lib/problem.js";
import {
  getCategoryBreakdownReport,
  getDashboardSummary,
  getDailyWeeklyReport,
  getIncomeVsExpenseReport,
} from "./service.js";
import { renderMonthlyReport, shareMonthlyReport } from "./monthlyReport.js";

type DashboardSummaryQuery = {
  month: string;
  timezone?: string;
};

type CategoryBreakdownQuery = {
  from: string;
  to: string;
  type: "income" | "expense";
  categoryId?: number;
};

type IncomeVsExpenseQuery = {
  months: number;
};

type DailyWeeklyQuery = {
  month: string;
};

type MonthlyExportQuery = {
  month: string;
  format: "pdf";
};

type MonthlyShareBody = {
  month: string;
  toEmail: string;
};

function requireUserId(req: Request): string {
  if (!req.user?.id) {
    throw unauthenticated();
  }

  return req.user.id;
}

export async function dashboardSummaryHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const query = req.query as unknown as DashboardSummaryQuery;

  const data = await getDashboardSummary({
    userId,
    month: query.month,
    timezone: query.timezone,
  });

  res.status(200).json({ data });
}

export async function categoryBreakdownHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const query = req.query as unknown as CategoryBreakdownQuery;

  const data = await getCategoryBreakdownReport({
    userId,
    from: query.from,
    to: query.to,
    type: query.type,
    categoryId: query.categoryId,
  });

  res.status(200).json({ data });
}

export async function incomeVsExpenseHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const query = req.query as unknown as IncomeVsExpenseQuery;

  const data = await getIncomeVsExpenseReport({
    userId,
    months: query.months,
  });

  res.status(200).json({ data });
}

export async function dailyWeeklyHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const query = req.query as unknown as DailyWeeklyQuery;

  const data = await getDailyWeeklyReport({
    userId,
    month: query.month,
  });

  res.status(200).json({ data });
}

export async function monthlyExportHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const query = req.query as unknown as MonthlyExportQuery;

  const pdfBuffer = await renderMonthlyReport(userId, query.month);

  res.status(200);
  res.type("application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="campus-coin-report-${query.month}.pdf"`,
  );
  res.send(pdfBuffer);
}

export async function monthlyShareHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const body = req.body as MonthlyShareBody;

  await shareMonthlyReport({ userId, month: body.month, toEmail: body.toEmail });

  res.status(200).json({ data: { sent: true } });
}
