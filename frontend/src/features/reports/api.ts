/**
 * api.ts
 * Thin wrappers around `/reports/*` (docs/spec/05b §5.8) and `GET /forecast/next-month` (P14,
 * docs/spec/05c §5.14 — kept here rather than a separate `features/forecast/` since it's just
 * another report tab). The PDF export is fetched as a `Blob` (a Bearer-token file response can't be
 * linked to with a plain `<a href>`), mirroring `features/imports/api.ts`'s `getImportTemplate`/
 * `getImportErrorsCsv`.
 * Exports: getCategoryBreakdown, getIncomeVsExpense, getDailyWeekly, getForecastNextMonth,
 *   exportMonthlyReportPdf, shareMonthlyReport
 * Spec: docs/spec/05b §5.8 · docs/spec/05c §5.14 · docs/spec/07 §7.3.3
 */
import type {
  ForecastNextMonthDto,
  ReportCategoryBreakdownDto,
  ReportCategoryBreakdownQueryInput,
  ReportDailyWeeklyDto,
  ReportDailyWeeklyQueryInput,
  ReportIncomeVsExpenseDto,
  ReportIncomeVsExpenseQueryInput,
  ReportShareInput,
} from '@campuscoin/shared';
import { apiClient } from '../../lib/apiClient/apiClient';

/** `GET /reports/category-breakdown?from&to&type&categoryId`. */
export async function getCategoryBreakdown(query: ReportCategoryBreakdownQueryInput): Promise<ReportCategoryBreakdownDto> {
  const response = await apiClient.get<ReportCategoryBreakdownDto>('/reports/category-breakdown', { params: query });
  return response.data;
}

/** `GET /reports/income-vs-expense?months=`. */
export async function getIncomeVsExpense(query: ReportIncomeVsExpenseQueryInput): Promise<ReportIncomeVsExpenseDto> {
  const response = await apiClient.get<ReportIncomeVsExpenseDto>('/reports/income-vs-expense', { params: query });
  return response.data;
}

/** `GET /reports/daily-weekly?month=`. */
export async function getDailyWeekly(query: ReportDailyWeeklyQueryInput): Promise<ReportDailyWeeklyDto> {
  const response = await apiClient.get<ReportDailyWeeklyDto>('/reports/daily-weekly', { params: query });
  return response.data;
}

/** `GET /forecast/next-month` — next month's per-category and totals spending forecast. */
export async function getForecastNextMonth(): Promise<ForecastNextMonthDto> {
  const response = await apiClient.get<ForecastNextMonthDto>('/forecast/next-month');
  return response.data;
}

/** `GET /reports/monthly/export?month=&format=pdf` — the rendered PDF as a downloadable `Blob`. */
export async function exportMonthlyReportPdf(month: string): Promise<Blob> {
  const response = await apiClient.get<Blob>('/reports/monthly/export', { params: { month, format: 'pdf' }, responseType: 'blob' });
  return response.data;
}

/** `POST /reports/monthly/share` — emails the monthly PDF (rate-limited to 5/day, Table 46). */
export async function shareMonthlyReport(input: ReportShareInput): Promise<void> {
  await apiClient.post('/reports/monthly/share', input);
}
