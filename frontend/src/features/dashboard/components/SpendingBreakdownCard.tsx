/**
 * SpendingBreakdownCard.tsx
 * Dashboard "Spending breakdown" widget: a lazy-loaded Chart.js doughnut with a toggle to a plain
 * `<table>` alternative (spec §8.5: every chart needs a text description AND a data-table
 * alternative, not just a chart). Chart.js is `React.lazy`-loaded so it never inflates the
 * dashboard route's own chunk (spec §10.1/§10.2).
 * Exports: SpendingBreakdownCard
 * Spec: docs/spec/05b §5.7 · docs/spec/08 §8.5 (accessibility)
 */
import type { DashboardCategoryBreakdownItem } from '@campuscoin/shared';
import { lazy, Suspense, useState } from 'react';
import { ChartSkeleton } from '../../../components/Skeletons';
import { EmptyState } from '../../../components/EmptyState';
import { MoneyText } from '../../../components/MoneyText';
import { en } from '../../../i18n/en';

const SpendingDoughnutChart = lazy(() => import('./charts/SpendingDoughnutChart'));

interface SpendingBreakdownCardProps {
  items: DashboardCategoryBreakdownItem[];
}

/** "Spending breakdown" widget: doughnut chart by default, with a "View as table" toggle. */
export function SpendingBreakdownCard({ items }: SpendingBreakdownCardProps) {
  const [showTable, setShowTable] = useState(false);

  return (
    <div className="card h-100">
      <div className="card-body">
        <div className="d-flex justify-content-between align-items-start mb-2">
          <h2 className="h6 mb-0">{en.dashboard.breakdown.title}</h2>
          {items.length > 0 ? (
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setShowTable((v) => !v)}>
              {showTable ? en.dashboard.breakdown.viewChart : en.dashboard.breakdown.viewTable}
            </button>
          ) : null}
        </div>

        {items.length === 0 ? (
          <EmptyState icon="bi-pie-chart" message={en.dashboard.breakdown.empty} />
        ) : showTable ? (
          <table className="table table-sm">
            <caption className="visually-hidden">{en.dashboard.breakdown.tableCaption}</caption>
            <thead>
              <tr>
                <th scope="col">{en.dashboard.breakdown.colCategory}</th>
                <th scope="col">{en.dashboard.breakdown.colAmount}</th>
                <th scope="col">{en.dashboard.breakdown.colShare}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.categoryId}>
                  <td>{item.name}</td>
                  <td>
                    <MoneyText amount={item.amount} />
                  </td>
                  <td>{item.sharePct.toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ height: '16rem' }}>
            <Suspense fallback={<ChartSkeleton />}>
              <SpendingDoughnutChart items={items} />
            </Suspense>
          </div>
        )}
      </div>
    </div>
  );
}
