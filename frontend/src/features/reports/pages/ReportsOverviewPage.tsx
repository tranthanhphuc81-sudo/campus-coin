/**
 * ReportsOverviewPage.tsx
 * "Income vs expense" report tab (`/app/reports`) — the reports overview (docs/spec/05b §5.8
 * Bảng 22: "Thu vs Chi 6 tháng"). Trailing-months window (3/6/12) reflected to the URL.
 * Exports: default (ReportsOverviewPage)
 * Spec: docs/spec/05b §5.8
 */
import { useRef } from 'react';
import { useSearchParams } from 'react-router';
import { CardSkeleton } from '../../../components/Skeletons';
import { ErrorState } from '../../../components/ErrorState';
import { en } from '../../../i18n/en';
import { ExportPngButton } from '../components/ExportPngButton';
import { useIncomeVsExpenseQuery } from '../hooks';
import { IncomeVsExpenseCard } from '../components/IncomeVsExpenseCard';

const MONTH_OPTIONS = [3, 6, 12] as const;

/** Reports overview tab: income vs expense trend over a selectable trailing-months window. */
export default function ReportsOverviewPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const months = MONTH_OPTIONS.includes(Number(searchParams.get('months')) as (typeof MONTH_OPTIONS)[number])
    ? Number(searchParams.get('months'))
    : 6;
  const query = useIncomeVsExpenseQuery({ months });
  const captureRef = useRef<HTMLDivElement>(null);

  return (
    <div>
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <div className="btn-group" role="group" aria-label={en.reports.overview.title}>
          {MONTH_OPTIONS.map((m) => (
            <button
              key={m}
              type="button"
              className={`btn btn-sm ${months === m ? 'btn-primary' : 'btn-outline-primary'}`}
              onClick={() => setSearchParams({ months: String(m) }, { replace: true })}
            >
              {m === 3 ? en.reports.overview.months3 : m === 6 ? en.reports.overview.months6 : en.reports.overview.months12}
            </button>
          ))}
        </div>
        <ExportPngButton targetRef={captureRef} filename={`campuscoin-report-income-vs-expense-${months}m.png`} />
      </div>

      <div ref={captureRef}>
        {query.isLoading ? (
          <CardSkeleton />
        ) : query.isError || !query.data ? (
          <ErrorState onRetry={() => void query.refetch()} />
        ) : (
          <IncomeVsExpenseCard items={query.data.months} />
        )}
      </div>
    </div>
  );
}
