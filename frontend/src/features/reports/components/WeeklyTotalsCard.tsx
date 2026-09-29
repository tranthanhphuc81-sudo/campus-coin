/**
 * WeeklyTotalsCard.tsx
 * "Daily / weekly" report's by-week chart card: lazy-loaded Chart.js bar chart with a "View as
 * table" toggle.
 * Exports: WeeklyTotalsCard
 * Spec: docs/spec/05b §5.8 · docs/spec/08 §8.5 (accessibility)
 */
import type { ReportWeeklyItem } from '@campuscoin/shared';
import { lazy, Suspense, useState } from 'react';
import { EmptyState } from '../../../components/EmptyState';
import { MoneyText } from '../../../components/MoneyText';
import { ChartSkeleton } from '../../../components/Skeletons';
import { en } from '../../../i18n/en';
import { formatDisplayDate } from '../../../lib/dates';

const IncomeExpenseBarChart = lazy(() => import('./charts/IncomeExpenseBarChart'));

interface WeeklyTotalsCardProps {
  weekly: ReportWeeklyItem[];
}

/** Bar chart of income/expense per ISO week, with a "View as table" toggle. */
export function WeeklyTotalsCard({ weekly }: WeeklyTotalsCardProps) {
  const [showTable, setShowTable] = useState(false);
  const t = en.reports.byPeriod;
  const hasData = weekly.some((w) => Number(w.income) > 0 || Number(w.expense) > 0);

  return (
    <div className="card">
      <div className="card-body">
        <div className="d-flex justify-content-between align-items-start mb-2">
          <h2 className="h6 mb-0">{t.weeklyTitle}</h2>
          {hasData ? (
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setShowTable((v) => !v)}>
              {showTable ? en.reports.viewChart : en.reports.viewTable}
            </button>
          ) : null}
        </div>

        {!hasData ? (
          <EmptyState icon="bi-bar-chart" message={t.empty} />
        ) : showTable ? (
          <table className="table table-sm">
            <caption className="visually-hidden">{t.tableCaptionWeekly}</caption>
            <thead>
              <tr>
                <th scope="col">{t.colWeek}</th>
                <th scope="col">{t.colIncome}</th>
                <th scope="col">{t.colExpense}</th>
              </tr>
            </thead>
            <tbody>
              {weekly.map((item) => (
                <tr key={`${item.isoYear}-${item.isoWeek}`}>
                  <td>
                    {formatDisplayDate(item.startDate)} – {formatDisplayDate(item.endDate)}
                  </td>
                  <td>
                    <MoneyText amount={item.income} />
                  </td>
                  <td>
                    <MoneyText amount={item.expense} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ height: '18rem' }}>
            <Suspense fallback={<ChartSkeleton />}>
              <IncomeExpenseBarChart
                labels={weekly.map((w) => `W${w.isoWeek}`)}
                income={weekly.map((w) => Number(w.income))}
                expense={weekly.map((w) => Number(w.expense))}
              />
            </Suspense>
          </div>
        )}
      </div>
    </div>
  );
}
