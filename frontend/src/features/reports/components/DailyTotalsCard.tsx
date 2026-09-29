/**
 * DailyTotalsCard.tsx
 * "Daily / weekly" report's by-day chart card: lazy-loaded Chart.js bar chart with a "View as
 * table" toggle.
 * Exports: DailyTotalsCard
 * Spec: docs/spec/05b §5.8 · docs/spec/08 §8.5 (accessibility)
 */
import type { ReportDailyItem } from '@campuscoin/shared';
import { lazy, Suspense, useState } from 'react';
import { EmptyState } from '../../../components/EmptyState';
import { MoneyText } from '../../../components/MoneyText';
import { ChartSkeleton } from '../../../components/Skeletons';
import { en } from '../../../i18n/en';
import { formatDisplayDate } from '../../../lib/dates';

const IncomeExpenseBarChart = lazy(() => import('./charts/IncomeExpenseBarChart'));

interface DailyTotalsCardProps {
  daily: ReportDailyItem[];
  averageIncome: string;
  averageExpense: string;
}

/** Bar chart of income/expense per calendar day, with a "View as table" toggle and day averages. */
export function DailyTotalsCard({ daily, averageIncome, averageExpense }: DailyTotalsCardProps) {
  const [showTable, setShowTable] = useState(false);
  const t = en.reports.byPeriod;
  const hasData = daily.some((d) => Number(d.income) > 0 || Number(d.expense) > 0);

  return (
    <div className="card">
      <div className="card-body">
        <div className="d-flex justify-content-between align-items-start mb-2">
          <h2 className="h6 mb-0">{t.dailyTitle}</h2>
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
            <caption className="visually-hidden">{t.tableCaptionDaily}</caption>
            <thead>
              <tr>
                <th scope="col">{t.colDate}</th>
                <th scope="col">{t.colIncome}</th>
                <th scope="col">{t.colExpense}</th>
              </tr>
            </thead>
            <tbody>
              {daily.map((item) => (
                <tr key={item.date}>
                  <td>{formatDisplayDate(item.date)}</td>
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
                labels={daily.map((d) => d.date.slice(8, 10))}
                income={daily.map((d) => Number(d.income))}
                expense={daily.map((d) => Number(d.expense))}
              />
            </Suspense>
          </div>
        )}

        {hasData ? (
          <p className="small text-body-secondary mt-2 mb-0">
            {t.averageIncomeLabel}: <MoneyText amount={averageIncome} /> · {t.averageExpenseLabel}: <MoneyText amount={averageExpense} />
          </p>
        ) : null}
      </div>
    </div>
  );
}
