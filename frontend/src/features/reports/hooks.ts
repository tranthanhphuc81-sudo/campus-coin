/**
 * hooks.ts
 * TanStack Query hooks for `/reports/*` and `/forecast/next-month`. Query keys start with the
 * literal `'reports'` — no mutation elsewhere invalidates them (reports are read-mostly and
 * Redis-cached server-side per docs/spec/10 §10.3), so each query just uses its own default
 * `staleTime`.
 * Exports: useCategoryBreakdownQuery, useIncomeVsExpenseQuery, useDailyWeeklyQuery,
 *   useForecastNextMonthQuery, useExportMonthlyReportPdfMutation, useShareMonthlyReportMutation
 * Spec: docs/spec/05b §5.8 · docs/spec/05c §5.14
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
import { useMutation, useQuery } from '@tanstack/react-query';
import type { ApiError } from '../../lib/apiClient/apiError';
import { exportMonthlyReportPdf, getCategoryBreakdown, getDailyWeekly, getForecastNextMonth, getIncomeVsExpense, shareMonthlyReport } from './api';

/** Reads the category-breakdown report for the given filters. */
export function useCategoryBreakdownQuery(query: ReportCategoryBreakdownQueryInput) {
  return useQuery<ReportCategoryBreakdownDto>({
    queryKey: ['reports', 'category-breakdown', query] as const,
    queryFn: () => getCategoryBreakdown(query),
  });
}

/** Reads the income-vs-expense trend for the trailing `months` months. */
export function useIncomeVsExpenseQuery(query: ReportIncomeVsExpenseQueryInput) {
  return useQuery<ReportIncomeVsExpenseDto>({
    queryKey: ['reports', 'income-vs-expense', query] as const,
    queryFn: () => getIncomeVsExpense(query),
  });
}

/** Reads the daily/weekly totals for the given month. */
export function useDailyWeeklyQuery(query: ReportDailyWeeklyQueryInput) {
  return useQuery<ReportDailyWeeklyDto>({
    queryKey: ['reports', 'daily-weekly', query] as const,
    queryFn: () => getDailyWeekly(query),
  });
}

/** Reads next month's spending forecast (3-month weighted average + known recurring amounts). */
export function useForecastNextMonthQuery() {
  return useQuery<ForecastNextMonthDto>({
    queryKey: ['reports', 'forecast', 'next-month'] as const,
    queryFn: () => getForecastNextMonth(),
  });
}

/** Downloads the monthly PDF report for `month` (the caller triggers the "Save As" itself). */
export function useExportMonthlyReportPdfMutation() {
  return useMutation<Blob, ApiError, string>({ mutationFn: (month: string) => exportMonthlyReportPdf(month) });
}

/** Emails the monthly PDF report to an address the user typed in. */
export function useShareMonthlyReportMutation() {
  return useMutation<void, ApiError, ReportShareInput>({ mutationFn: (input: ReportShareInput) => shareMonthlyReport(input) });
}
