/**
 * DashboardPage.tsx
 * Student home page (`/app`): month selector, greeting, quick actions and the full widget grid
 * backed by the single `GET /dashboard/summary` aggregate (docs/spec/05b §5.7 Bảng 21). Responsive
 * per spec §8.4: 1 col `<576px`, 2 cols `>=576/768px`, 3 cols `>=992px`, 4 cols `>=1200px`.
 * Exports: default (DashboardPage)
 * Spec: docs/spec/05b §5.7 (dashboard) · docs/spec/08 §8.4 (breakpoints), §8.6 (loading/empty/error)
 */
import { CardSkeleton } from '../../../components/Skeletons';
import { ErrorState } from '../../../components/ErrorState';
import { MonthSelector } from '../../../components/MonthSelector';
import { en } from '../../../i18n/en';
import { currentLocalMonth } from '../../../lib/dates';
import { useAuth } from '../../../lib/auth/AuthContext';
import { useState } from 'react';
import { BalanceCard } from '../components/BalanceCard';
import { BudgetVsActualCard } from '../components/BudgetVsActualCard';
import { LatestInsightCard } from '../components/LatestInsightCard';
import { MonthlyTrendCard } from '../components/MonthlyTrendCard';
import { QuickActionsRow } from '../components/QuickActionsRow';
import { RecentActivityCard } from '../components/RecentActivityCard';
import { SavingsGoalCard } from '../components/SavingsGoalCard';
import { SpendingBreakdownCard } from '../components/SpendingBreakdownCard';
import { TipsCard } from '../components/TipsCard';
import { TopCategoryCard } from '../components/TopCategoryCard';
import { useDashboardSummaryQuery } from '../hooks';

/** Picks a time-of-day greeting key from the *browser's* local clock (not the server's). */
function greetingPart(): 'morning' | 'afternoon' | 'evening' {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

/** Student home page: greeting, quick actions and the full dashboard widget grid. */
export default function DashboardPage() {
  const { user } = useAuth();
  const [month, setMonth] = useState(() => currentLocalMonth(user?.timezone));
  const summaryQuery = useDashboardSummaryQuery({ month });

  return (
    <>
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-2">
        <h1 className="h2 mb-0">{summaryQuery.data ? en.dashboard.greeting[greetingPart()](summaryQuery.data.greetingName) : en.nav.dashboard}</h1>
        <MonthSelector month={month} onChange={setMonth} label={en.dashboard.monthLabel} />
      </div>

      <QuickActionsRow />

      {summaryQuery.isLoading ? (
        <div className="row row-cols-1 row-cols-sm-2 row-cols-lg-3 row-cols-xl-4 g-3">
          {Array.from({ length: 8 }, (_, i) => (
            <div className="col" key={i}>
              <CardSkeleton />
            </div>
          ))}
        </div>
      ) : summaryQuery.isError || !summaryQuery.data ? (
        <ErrorState onRetry={() => void summaryQuery.refetch()} />
      ) : (
        <div className="row row-cols-1 row-cols-sm-2 row-cols-lg-3 row-cols-xl-4 g-3">
          <div className="col">
            <BalanceCard totals={summaryQuery.data.totals} />
          </div>
          <div className="col">
            <TopCategoryCard topCategory={summaryQuery.data.topCategory} />
          </div>
          <div className="col">
            <SavingsGoalCard savingsGoal={summaryQuery.data.savingsGoal} />
          </div>
          <div className="col">
            <LatestInsightCard insight={summaryQuery.data.latestInsight} />
          </div>
          <div className="col col-sm-12 col-lg-6 col-xl-6">
            <BudgetVsActualCard budgets={summaryQuery.data.budgets} />
          </div>
          <div className="col col-sm-12 col-lg-6 col-xl-6">
            <SpendingBreakdownCard items={summaryQuery.data.categoryBreakdown} />
          </div>
          <div className="col col-sm-12 col-lg-12 col-xl-12">
            <MonthlyTrendCard items={summaryQuery.data.monthlyTrend} />
          </div>
          <div className="col">
            <TipsCard tips={summaryQuery.data.tips} />
          </div>
          <div className="col">
            <RecentActivityCard activity={summaryQuery.data.recentActivity} />
          </div>
        </div>
      )}
    </>
  );
}
