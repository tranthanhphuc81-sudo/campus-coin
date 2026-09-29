/**
 * dashboard.ts
 * Zod schema and DTO type for the single aggregate `GET /dashboard/summary` endpoint (docs/spec
 * 05b §5.7 Bảng 21) — one call backs every dashboard widget; every widget's numbers are computed
 * with SQL aggregation on the backend, never pulled into Node and summed there (docs/spec/10 §10.2).
 * `tips`/`latestInsight` are populated from the P13 tips/insights engines; `recentActivity` is
 * populated from the P14 recent-activity tracking (backend/src/lib + `activity` module).
 * Main exports: dashboardSummaryQuerySchema + inferred type, DashboardSummaryDto and its
 *   constituent widget interfaces
 * Spec: docs/spec/05b §5.7 · docs/spec/07 §7.3.3
 */
import { z } from 'zod';
import type { RecentActivityAction, TransactionType } from '../enums.js';
import { localDateSchema } from './common.js';
import type { BudgetDto } from './budget.js';

/** Query of `GET /dashboard/summary?month=`. Omitted `month` means the caller's current month. */
export const dashboardSummaryQuerySchema = z.object({ month: localDateSchema.optional() }).strict();
/** Inferred input type of {@link dashboardSummaryQuerySchema}. */
export type DashboardSummaryQueryInput = z.infer<typeof dashboardSummaryQuerySchema>;

/** "This month's balance" widget: totals plus % change vs the previous month. */
export interface DashboardTotals {
  income: string;
  expense: string;
  net: string;
  /** `null` when the previous month has no data to compare against (division by zero). */
  incomeChangePct: number | null;
  expenseChangePct: number | null;
}

/** "Top category this month" widget. */
export interface DashboardTopCategory {
  categoryId: number;
  name: string;
  icon: string | null;
  color: string | null;
  amount: string;
  sharePct: number;
}

/** One slice of the "Spending breakdown" doughnut widget. */
export interface DashboardCategoryBreakdownItem {
  categoryId: number;
  name: string;
  color: string | null;
  amount: string;
  sharePct: number;
}

/** One bar-pair of the "6-month trend" widget. */
export interface DashboardMonthTrendItem {
  /** First day of the month, `YYYY-MM-DD`. */
  month: string;
  income: string;
  expense: string;
}

/** "Savings goal" widget; `null` when the user has not set `monthlySavingsGoal`. */
export interface DashboardSavingsGoal {
  targetAmount: string;
  progressAmount: string;
  progressPct: number | null;
}

/** "Latest insight" widget summary; `null` until the caller has at least one completed insight. */
export interface DashboardInsightSummary {
  month: string;
  summaryText: string;
}

/** One entry of the "Savings tips" widget. `id` is a string because `user_tips.id` is a BigInt PK
 * (matches {@link TipDto}'s own convention, P13). */
export interface DashboardTipSummary {
  id: string;
  title: string;
  impactScore: number;
}

/** One entry of the "Recent" widget (P14, docs/spec/05c §5.14). */
export interface DashboardRecentActivityItem {
  transactionId: string;
  description: string | null;
  amount: string;
  type: TransactionType;
  /** Whether this row was a view or an edit. */
  action: RecentActivityAction;
  viewedAt: string;
}

/** Response body of `GET /dashboard/summary`, backing every widget in docs/spec/05b Bảng 21. */
export interface DashboardSummaryDto {
  month: string;
  greetingName: string;
  totals: DashboardTotals;
  topCategory: DashboardTopCategory | null;
  budgets: BudgetDto[];
  categoryBreakdown: DashboardCategoryBreakdownItem[];
  monthlyTrend: DashboardMonthTrendItem[];
  savingsGoal: DashboardSavingsGoal | null;
  latestInsight: DashboardInsightSummary | null;
  tips: DashboardTipSummary[];
  recentActivity: DashboardRecentActivityItem[];
}
