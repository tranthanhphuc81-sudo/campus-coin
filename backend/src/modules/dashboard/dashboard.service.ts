/**
 * dashboard.service.ts
 * Business logic backing the single `GET /dashboard/summary` endpoint that feeds every widget on
 * the student dashboard (docs/spec/05b §5.7 Bảng 21). Cached in Redis for
 * {@link DASHBOARD_CACHE_TTL_SEC}; `cache-invalidator.handler.ts` clears the same key
 * (`dashboardKey(userId, month)`) after any transaction change, so a cache miss here simply
 * recomputes. Every aggregate is computed with SQL (never summed from raw rows in Node) —
 * `latestInsight`/`tips` are populated from the P13 engines (both are inherently "current", not
 * scoped to the requested `month` — the latest completed insight is always the most recent
 * analysed month regardless of which month the dashboard is showing, and tips are always for the
 * caller's current period). `recentActivity` (P14) is deliberately NEVER cached — a view never
 * invalidates the dashboard cache, so it is always computed fresh, on every call, and merged onto
 * the (possibly cached) rest of the summary.
 * Main exports: summary
 * Spec: docs/spec/05b §5.7 · docs/spec/10 §10.2 (SQL aggregation) · §10.3 (cache strategy)
 */
import {
  DASHBOARD_CACHE_TTL_SEC,
  DASHBOARD_RECENT_ACTIVITY_N,
  DASHBOARD_TREND_MONTHS,
  TIPS_DASHBOARD_TOP_N,
  type DashboardCategoryBreakdownItem,
  type DashboardInsightSummary,
  type DashboardMonthTrendItem,
  type DashboardRecentActivityItem,
  type DashboardSavingsGoal,
  type DashboardSummaryDto,
  type DashboardSummaryQueryInput,
  type DashboardTipSummary,
  type DashboardTopCategory,
  type DashboardTotals,
} from '@campuscoin/shared';
import * as activityService from '../activity/activity.service.js';
import * as budgetsService from '../budgets/budgets.service.js';
import type { CategoryModel } from '../../generated/prisma/models/Category.js';
import { insightsRepository } from '../insights/insights.repository.js';
import { tipsRepository } from '../tips/tips.repository.js';
import { addDays, firstDayOfMonth, todayInTimeZone, trailingMonths } from '../../lib/dates.js';
import { cacheGet, cacheSet } from '../../lib/cache.js';
import { dashboardKey } from '../../lib/cacheKeys.js';
import { Decimal, percentOf, sub, toMoney, toMoneyString } from '../../lib/money.js';
import { notFound } from '../../lib/problem.js';
import { usersRepository } from '../users/users.repository.js';
import { dashboardRepository, type CategoryAmount } from './dashboard.repository.js';

/**
 * Rounded % change of `current` vs `previous`: `(current - previous) / previous * 100`.
 * `null` when `previous` is not strictly positive (no meaningful baseline to compare against).
 */
function changePct(current: Decimal, previous: Decimal): number | null {
  if (!previous.greaterThan(0)) return null;
  return current.minus(previous).dividedBy(previous).times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

/** Builds the "top category"/"breakdown" widgets from an already-summed, sorted category list. */
function buildCategoryWidgets(
  rows: CategoryAmount[],
  categoriesById: Map<number, CategoryModel>,
  totalExpense: Decimal,
): { topCategory: DashboardTopCategory | null; categoryBreakdown: DashboardCategoryBreakdownItem[] } {
  const categoryBreakdown: DashboardCategoryBreakdownItem[] = rows.map((row) => {
    const category = categoriesById.get(row.categoryId);
    return {
      categoryId: row.categoryId,
      name: category?.name ?? '',
      color: category?.color ?? null,
      amount: toMoneyString(row.amount),
      sharePct: percentOf(row.amount, totalExpense),
    };
  });

  const top = rows[0];
  const topCategory: DashboardTopCategory | null = top
    ? { ...categoryBreakdown[0]!, icon: categoriesById.get(top.categoryId)?.icon ?? null }
    : null;

  return { topCategory, categoryBreakdown };
}

/** Every widget of {@link DashboardSummaryDto} except `recentActivity` — the shape actually cached. */
type CacheableDashboardSummary = Omit<DashboardSummaryDto, 'recentActivity'>;

/**
 * Builds the "Recent" widget fresh (P14 §5.14) — NEVER cached, since a view/edit never invalidates
 * the dashboard cache: a stale cache hit would otherwise show recent-activity from before the
 * cache was last written.
 */
async function buildRecentActivity(userId: string): Promise<DashboardRecentActivityItem[]> {
  const rows = await activityService.listRecent(userId, DASHBOARD_RECENT_ACTIVITY_N);
  return rows.map((row) => ({
    transactionId: row.transactionId,
    description: row.description,
    amount: row.amount,
    type: row.type,
    action: row.action,
    viewedAt: row.occurredAt,
  }));
}

/**
 * Builds the aggregate dashboard summary for `userId`+the requested (or current) month. Reuses
 * `budgets.service.ts`'s own list-with-consumption SQL for the `budgets` widget instead of
 * duplicating it.
 * @throws {AppError} 404 when the account no longer exists.
 */
export async function summary(userId: string, query: DashboardSummaryQueryInput): Promise<DashboardSummaryDto> {
  const user = await usersRepository.findById(userId);
  if (!user) throw notFound('Account not found.');
  const month = query.month ?? firstDayOfMonth(todayInTimeZone(user.timezone));

  const cacheKey = dashboardKey(userId, month);
  // Started in parallel with the cache read/rebuild below — this never depends on cache state.
  const recentActivityPromise = buildRecentActivity(userId);

  const cached = await cacheGet<CacheableDashboardSummary>(cacheKey);
  if (cached) return { ...cached, recentActivity: await recentActivityPromise };

  const previousMonth = firstDayOfMonth(addDays(month, -1));
  const trendMonths = trailingMonths(month, DASHBOARD_TREND_MONTHS);
  const currentPeriod = firstDayOfMonth(todayInTimeZone(user.timezone));

  const [totalsThisMonth, totalsPrevMonth, expenseCategories, budgets, monthlyTrend, latestInsightRow, topTips] = await Promise.all([
    dashboardRepository.totalsForMonth(userId, month),
    dashboardRepository.totalsForMonth(userId, previousMonth),
    dashboardRepository.expenseByCategory(userId, month),
    budgetsService.list(userId, { month }),
    Promise.all(
      trendMonths.map(async (m): Promise<DashboardMonthTrendItem> => {
        const totals = await dashboardRepository.totalsForMonth(userId, m);
        return { month: m, income: toMoneyString(totals.income), expense: toMoneyString(totals.expense) };
      }),
    ),
    insightsRepository.findLatestCompleted(userId),
    tipsRepository.topRanked(userId, currentPeriod, TIPS_DASHBOARD_TOP_N),
  ]);

  const latestInsight: DashboardInsightSummary | null = latestInsightRow
    ? { month: latestInsightRow.month.toISOString().slice(0, 10), summaryText: latestInsightRow.summaryText ?? '' }
    : null;
  const tips: DashboardTipSummary[] = topTips.map((tip) => ({
    id: tip.id.toString(),
    title: tip.renderedTitle,
    impactScore: tip.score.toNumber(),
  }));

  const categoriesById = await dashboardRepository.categoriesByIds(expenseCategories.map((row) => row.categoryId));

  const totals: DashboardTotals = {
    income: toMoneyString(totalsThisMonth.income),
    expense: toMoneyString(totalsThisMonth.expense),
    net: toMoneyString(sub(totalsThisMonth.income, totalsThisMonth.expense)),
    incomeChangePct: changePct(totalsThisMonth.income, totalsPrevMonth.income),
    expenseChangePct: changePct(totalsThisMonth.expense, totalsPrevMonth.expense),
  };

  const { topCategory, categoryBreakdown } = buildCategoryWidgets(expenseCategories, categoriesById, totalsThisMonth.expense);

  let savingsGoal: DashboardSavingsGoal | null = null;
  if (user.monthlySavingsGoal) {
    const progressAmount = sub(totalsThisMonth.income, totalsThisMonth.expense);
    savingsGoal = {
      targetAmount: toMoneyString(user.monthlySavingsGoal),
      progressAmount: toMoneyString(progressAmount),
      progressPct: percentOf(progressAmount, toMoney(user.monthlySavingsGoal)),
    };
  }

  const cacheable: CacheableDashboardSummary = {
    month,
    greetingName: user.fullName.split(' ')[0] || user.fullName,
    totals,
    topCategory,
    budgets,
    categoryBreakdown,
    monthlyTrend,
    savingsGoal,
    latestInsight,
    tips,
  };

  await cacheSet(cacheKey, cacheable, DASHBOARD_CACHE_TTL_SEC);
  return { ...cacheable, recentActivity: await recentActivityPromise };
}
