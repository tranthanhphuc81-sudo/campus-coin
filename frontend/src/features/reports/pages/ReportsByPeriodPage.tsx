/**
 * ReportsByPeriodPage.tsx
 * "Daily / weekly" report tab (`/app/reports/by-period`, docs/spec/05b §5.8 Bảng 22): totals per
 * calendar day and per ISO week for one month, plus the daily average. The month is URL-synced
 * (`?month=`) like `DashboardPage`/`BudgetsPage`.
 * Exports: default (ReportsByPeriodPage)
 * Spec: docs/spec/05b §5.8
 */
import { useRef } from 'react';
import { useSearchParams } from 'react-router';
import { CardSkeleton } from '../../../components/Skeletons';
import { ErrorState } from '../../../components/ErrorState';
import { MonthSelector } from '../../../components/MonthSelector';
import { en } from '../../../i18n/en';
import { useAuth } from '../../../lib/auth/AuthContext';
import { currentLocalMonth } from '../../../lib/dates';
import { DailyTotalsCard } from '../components/DailyTotalsCard';
import { ExportPngButton } from '../components/ExportPngButton';
import { WeeklyTotalsCard } from '../components/WeeklyTotalsCard';
import { useDailyWeeklyQuery } from '../hooks';

/** "Daily / weekly" report tab: by-day and by-week totals for one selectable month. */
export default function ReportsByPeriodPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const month = searchParams.get('month') ?? currentLocalMonth(user?.timezone);
  const query = useDailyWeeklyQuery({ month });
  const captureRef = useRef<HTMLDivElement>(null);

  return (
    <div>
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <MonthSelector month={month} onChange={(m) => setSearchParams({ month: m }, { replace: true })} label={en.reports.byPeriod.monthLabel} />
        <ExportPngButton targetRef={captureRef} filename={`campuscoin-report-daily-weekly-${month.slice(0, 7)}.png`} />
      </div>

      <div ref={captureRef}>
        {query.isLoading ? (
          <div className="row g-3">
            <div className="col-12">
              <CardSkeleton />
            </div>
            <div className="col-12">
              <CardSkeleton />
            </div>
          </div>
        ) : query.isError || !query.data ? (
          <ErrorState onRetry={() => void query.refetch()} />
        ) : (
          <div className="row g-3">
            <div className="col-12">
              <DailyTotalsCard daily={query.data.daily} averageIncome={query.data.averageDailyIncome} averageExpense={query.data.averageDailyExpense} />
            </div>
            <div className="col-12">
              <WeeklyTotalsCard weekly={query.data.weekly} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
