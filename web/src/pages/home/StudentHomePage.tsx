import { DoughnutChart, GroupedBarChart, LineChart } from "@/components/charts";
import WidgetErrorBoundary from "@/components/common/WidgetErrorBoundary";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import BookmarkButton from "@/components/bookmarks/BookmarkButton";
import { en } from "@/content/en";
import { useDashboardSummary, useRecentActivity } from "@/features/analytics/hooks";
import { useDismissTip, usePinTip, useUnpinTip } from "@/features/tips/hooks";
import { formatMoney } from "@/lib/money";

function toIsoMonth(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function WidgetSkeleton() {
  return (
    <section className="dashboard-widget panel" aria-hidden="true">
      <div className="dashboard-widget__skeleton" />
    </section>
  );
}

function WidgetErrorFallback() {
  return (
    <section className="dashboard-widget panel">
      <h3>{en.dashboard.widgetErrorTitle}</h3>
      <p>{en.dashboard.widgetErrorDetail}</p>
    </section>
  );
}

type DashboardWidgetProps = {
  isLoading: boolean;
  error: unknown;
  children: ReactNode;
};

function DashboardWidget({ isLoading, error, children }: DashboardWidgetProps) {
  if (isLoading) {
    return <WidgetSkeleton />;
  }

  if (error) {
    throw error;
  }

  return <>{children}</>;
}

type TipActionButtonsProps = {
  tipId: string;
  status: "active" | "pinned";
};

function TipActionButtons({ tipId, status }: TipActionButtonsProps) {
  const pinMutation = usePinTip();
  const unpinMutation = useUnpinTip();
  const dismissMutation = useDismissTip();
  const isBusy = pinMutation.isPending || unpinMutation.isPending || dismissMutation.isPending;

  return (
    <div className="dashboard-tip-actions">
      {status === "pinned" ? (
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => {
            void unpinMutation.mutateAsync(tipId);
          }}
          disabled={isBusy}
        >
          {en.tips.actions.unpin}
        </button>
      ) : (
        <>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              void pinMutation.mutateAsync(tipId);
            }}
            disabled={isBusy}
          >
            {en.tips.actions.pin}
          </button>
        </>
      )}

      <button
        type="button"
        className="btn btn-outline"
        onClick={() => {
          void dismissMutation.mutateAsync(tipId);
        }}
        disabled={isBusy}
      >
        {en.tips.actions.dismiss}
      </button>

      <BookmarkButton
        targetType="tip"
        targetRef={tipId}
        ariaLabel={en.bookmarks.actions.bookmark}
      />
    </div>
  );
}

export default function StudentHomePage() {
  const month = toIsoMonth(new Date());
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dashboardQuery = useDashboardSummary(month, timezone);
  const recentActivityQuery = useRecentActivity();
  const summary = dashboardQuery.data;

  return (
    <section className="dashboard-page" aria-labelledby="dashboard-title">
      <header className="dashboard-page__header">
        <h1 id="dashboard-title">{en.dashboard.title}</h1>
        <p>{en.dashboard.subtitle}</p>
      </header>

      <div className="row row-cols-1 row-cols-md-2 row-cols-lg-3 g-3">
        <div className="col">
          <WidgetErrorBoundary fallback={<WidgetErrorFallback />}>
            <DashboardWidget isLoading={dashboardQuery.isLoading} error={dashboardQuery.error}>
              <section className="dashboard-widget panel">
                <h3>{en.dashboard.widgets.greeting}</h3>
                <p>{summary?.greeting.message}</p>
                <p className="dashboard-widget__meta">
                  {summary?.greeting.localDate} · {summary?.greeting.timezone}
                </p>
              </section>
            </DashboardWidget>
          </WidgetErrorBoundary>
        </div>

        <div className="col">
          <WidgetErrorBoundary fallback={<WidgetErrorFallback />}>
            <DashboardWidget isLoading={dashboardQuery.isLoading} error={dashboardQuery.error}>
              <section className="dashboard-widget panel">
                <h3>{en.dashboard.widgets.monthlyBalance}</h3>
                <p className="money-value">{formatMoney(summary?.totals.net ?? "0")}</p>
                <p className="dashboard-widget__meta">
                  {en.dashboard.labels.income}: {formatMoney(summary?.totals.income ?? "0")}
                </p>
                <p className="dashboard-widget__meta">
                  {en.dashboard.labels.expense}: {formatMoney(summary?.totals.expense ?? "0")}
                </p>
              </section>
            </DashboardWidget>
          </WidgetErrorBoundary>
        </div>

        <div className="col">
          <WidgetErrorBoundary fallback={<WidgetErrorFallback />}>
            <DashboardWidget isLoading={dashboardQuery.isLoading} error={dashboardQuery.error}>
              <section className="dashboard-widget panel">
                <h3>{en.dashboard.widgets.topCategory}</h3>
                <p>{summary?.topCategory?.categoryName ?? en.dashboard.emptyTopCategory}</p>
                <p className="money-value">{formatMoney(summary?.topCategory?.amount ?? "0")}</p>
                <p className="dashboard-widget__meta">
                  {(summary?.topCategory?.sharePct ?? 0).toFixed(1)}%
                </p>
              </section>
            </DashboardWidget>
          </WidgetErrorBoundary>
        </div>

        <div className="col">
          <WidgetErrorBoundary fallback={<WidgetErrorFallback />}>
            <DashboardWidget isLoading={dashboardQuery.isLoading} error={dashboardQuery.error}>
              <section className="dashboard-widget panel">
                <h3>{en.dashboard.widgets.budgetVsActual}</h3>
                <ul className="dashboard-budget-list">
                  {(summary?.budgetVsActual ?? []).slice(0, 4).map((item) => (
                    <li key={item.categoryId}>
                      <div>
                        <strong>{item.categoryName}</strong>
                        <p className="money-value">
                          {formatMoney(item.spent)} / {formatMoney(item.limitAmount)}
                        </p>
                      </div>
                      <span>{item.percent.toFixed(0)}%</span>
                    </li>
                  ))}
                </ul>
              </section>
            </DashboardWidget>
          </WidgetErrorBoundary>
        </div>

        <div className="col">
          <WidgetErrorBoundary fallback={<WidgetErrorFallback />}>
            <DashboardWidget isLoading={dashboardQuery.isLoading} error={dashboardQuery.error}>
              <DoughnutChart
                title={en.dashboard.widgets.expenseStructure}
                caption={en.dashboard.a11y.expenseStructureTableCaption}
                data={(summary?.categoryBreakdown ?? []).map((item) => ({
                  label: item.categoryName,
                  value: item.amount,
                }))}
              />
            </DashboardWidget>
          </WidgetErrorBoundary>
        </div>

        <div className="col">
          <WidgetErrorBoundary fallback={<WidgetErrorFallback />}>
            <DashboardWidget isLoading={dashboardQuery.isLoading} error={dashboardQuery.error}>
              <GroupedBarChart
                title={en.dashboard.widgets.sixMonthTrend}
                caption={en.dashboard.a11y.sixMonthTrendTableCaption}
                labels={(summary?.trend6Months ?? []).map((row) => row.month)}
                series={[
                  {
                    label: en.dashboard.labels.income,
                    values: (summary?.trend6Months ?? []).map((row) => row.income),
                  },
                  {
                    label: en.dashboard.labels.expense,
                    values: (summary?.trend6Months ?? []).map((row) => row.expense),
                  },
                ]}
              />
            </DashboardWidget>
          </WidgetErrorBoundary>
        </div>

        <div className="col">
          <WidgetErrorBoundary fallback={<WidgetErrorFallback />}>
            <DashboardWidget isLoading={dashboardQuery.isLoading} error={dashboardQuery.error}>
              <LineChart
                title={en.dashboard.widgets.netTrend}
                caption={en.dashboard.a11y.netTrendTableCaption}
                labels={(summary?.trend6Months ?? []).map((row) => row.month)}
                series={[
                  {
                    label: en.dashboard.labels.net,
                    values: (summary?.trend6Months ?? []).map((row) => row.net),
                  },
                ]}
              />
            </DashboardWidget>
          </WidgetErrorBoundary>
        </div>

        <div className="col">
          <WidgetErrorBoundary fallback={<WidgetErrorFallback />}>
            <DashboardWidget isLoading={dashboardQuery.isLoading} error={dashboardQuery.error}>
              <section className="dashboard-widget panel">
                <h3>{en.dashboard.widgets.savingsGoal}</h3>
                <p className="money-value">
                  {formatMoney(summary?.savingsGoalProgress.netAmount ?? "0")}
                </p>
                <p className="dashboard-widget__meta">
                  {en.dashboard.labels.goal}:{" "}
                  {formatMoney(summary?.savingsGoalProgress.goalAmount ?? "0")}
                </p>
                <p className="dashboard-widget__meta">
                  {Math.max(summary?.savingsGoalProgress.progressPct ?? 0, 0).toFixed(1)}%
                </p>
              </section>
            </DashboardWidget>
          </WidgetErrorBoundary>
        </div>

        <div className="col">
          <WidgetErrorBoundary fallback={<WidgetErrorFallback />}>
            <DashboardWidget isLoading={dashboardQuery.isLoading} error={dashboardQuery.error}>
              <section className="dashboard-widget panel">
                <h3>{en.layout.studentNav.tips}</h3>
                <ul className="dashboard-tips-list">
                  {(summary?.tips ?? []).slice(0, 3).map((tip) => (
                    <li key={tip.id}>
                      <p className="dashboard-widget__meta">{tip.title}</p>
                      <p>{tip.body}</p>
                      <p className="dashboard-widget__meta">
                        {en.tips.impactLabel}: {formatMoney(tip.impactAmount)}
                      </p>
                      <TipActionButtons tipId={tip.id} status={tip.status} />
                    </li>
                  ))}
                </ul>
                <Link to={en.routes.tips}>{en.tips.viewAllAction}</Link>
              </section>
            </DashboardWidget>
          </WidgetErrorBoundary>
        </div>

        <div className="col">
          <WidgetErrorBoundary fallback={<WidgetErrorFallback />}>
            <DashboardWidget isLoading={dashboardQuery.isLoading} error={dashboardQuery.error}>
              <section className="dashboard-widget panel">
                <h3>{en.dashboard.widgets.latestInsight}</h3>
                {summary?.latestInsight ? (
                  <>
                    <p className="dashboard-widget__meta">{summary.latestInsight.month}</p>
                    <p>{summary.latestInsight.summaryText}</p>
                    <p className="dashboard-widget__meta">{en.dashboard.latestInsightAiLabel}</p>
                    <Link to={en.routes.insights}>{en.dashboard.latestInsightViewAction}</Link>
                  </>
                ) : (
                  <p>{en.dashboard.latestInsightPlaceholder}</p>
                )}
              </section>
            </DashboardWidget>
          </WidgetErrorBoundary>
        </div>

        <div className="col">
          <WidgetErrorBoundary fallback={<WidgetErrorFallback />}>
            <DashboardWidget
              isLoading={recentActivityQuery.isLoading}
              error={recentActivityQuery.error}
            >
              <section className="dashboard-widget panel">
                <h3>{en.dashboard.widgets.recentActivity}</h3>
                {(recentActivityQuery.data?.items ?? []).length > 0 ? (
                  <ul className="dashboard-recent-list">
                    {(recentActivityQuery.data?.items ?? []).slice(0, 5).map((item) => (
                      <li key={item.id}>
                        <strong>{item.categoryName}</strong>
                        <p className="money-value">{formatMoney(item.amount)}</p>
                        <p className="dashboard-widget__meta">
                          {item.txnDate} ·
                          {item.activityType === "edited"
                            ? en.dashboard.recentActivityLabels.edited
                            : en.dashboard.recentActivityLabels.viewed}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="dashboard-widget__meta">{en.dashboard.recentActivityEmpty}</p>
                )}
              </section>
            </DashboardWidget>
          </WidgetErrorBoundary>
        </div>
      </div>
    </section>
  );
}
