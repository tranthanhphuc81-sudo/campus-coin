/**
 * MonthlyTrendCard.tsx
 * Dashboard "6-month trend" widget: a lazy-loaded Chart.js grouped bar chart with a toggle to a
 * plain `<table>` alternative (spec §8.5 accessibility requirement).
 * Exports: MonthlyTrendCard
 * Spec: docs/spec/05b §5.7 · docs/spec/08 §8.5 (accessibility)
 */
import type { DashboardMonthTrendItem } from '@campuscoin/shared';
import { lazy, Suspense, useState } from 'react';
import { ChartSkeleton } from '../../../components/Skeletons';
import { EmptyState } from '../../../components/EmptyState';
import { MoneyText } from '../../../components/MoneyText';
import { en } from '../../../i18n/en';
import { formatMonthLabel } from '../../../lib/dates';

const MonthlyTrendChart = lazy(() => import('./charts/MonthlyTrendChart'));

interface MonthlyTrendCardProps {
  items: DashboardMonthTrendItem[];
}

/** "6-month trend" widget: grouped bar chart by default, with a "View as table" toggle. */
export function MonthlyTrendCard({ items }: MonthlyTrendCardProps) {
  const [showTable, setShowTable] = useState(false);
  const hasData = items.some((item) => Number(item.income) > 0 || Number(item.expense) > 0);

  return (
    <div className="card h-100">
      <div className="card-body">
        <div className="d-flex justify-content-between align-items-start mb-2">
          <h2 className="h6 mb-0">{en.dashboard.trend.title}</h2>
          {hasData ? (
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setShowTable((v) => !v)}>
              {showTable ? en.dashboard.breakdown.viewChart : en.dashboard.breakdown.viewTable}
            </button>
          ) : null}
        </div>

        {!hasData ? (
          <EmptyState icon="bi-bar-chart" message={en.dashboard.trend.empty} />
        ) : showTable ? (
          <table className="table table-sm">
            <caption className="visually-hidden">{en.dashboard.trend.tableCaption}</caption>
            <thead>
              <tr>
                <th scope="col">{en.dashboard.trend.colMonth}</th>
                <th scope="col">{en.dashboard.trend.colIncome}</th>
                <th scope="col">{en.dashboard.trend.colExpense}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.month}>
                  <td>{formatMonthLabel(item.month)}</td>
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
          <div style={{ height: '16rem' }}>
            <Suspense fallback={<ChartSkeleton />}>
              <MonthlyTrendChart items={items} />
            </Suspense>
          </div>
        )}
      </div>
    </div>
  );
}
