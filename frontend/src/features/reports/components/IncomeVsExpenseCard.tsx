/**
 * IncomeVsExpenseCard.tsx
 * "Income vs expense" report card: lazy-loaded Chart.js combo chart with a "View as table"
 * toggle (spec §8.5: every chart needs a text/table alternative, not just a chart).
 * Exports: IncomeVsExpenseCard
 * Spec: docs/spec/05b §5.8 · docs/spec/08 §8.5 (accessibility)
 */
import type { ReportIncomeVsExpenseMonth } from '@campuscoin/shared';
import { lazy, Suspense, useState } from 'react';
import { EmptyState } from '../../../components/EmptyState';
import { MoneyText } from '../../../components/MoneyText';
import { ChartSkeleton } from '../../../components/Skeletons';
import { en } from '../../../i18n/en';
import { formatMonthLabel } from '../../../lib/dates';

const IncomeVsExpenseComboChart = lazy(() => import('./charts/IncomeVsExpenseComboChart'));

interface IncomeVsExpenseCardProps {
  items: ReportIncomeVsExpenseMonth[];
}

/**
 * `MoneyText` expects a non-negative magnitude plus an explicit `type` to determine sign/colour —
 * `net` can genuinely be negative (expenses exceeded income), so derive the sign/colour from its
 * own value here (mirrors the dashboard's `BalanceCard.tsx` "This month" widget).
 */
function netMoneyProps(net: string): { amount: string; type?: 'income' | 'expense' } {
  const numeric = Number(net);
  if (numeric < 0) return { amount: Math.abs(numeric).toFixed(2), type: 'expense' };
  if (numeric > 0) return { amount: net, type: 'income' };
  return { amount: net };
}

/** Combo chart (grouped bars + net line) by default, with a "View as table" toggle. */
export function IncomeVsExpenseCard({ items }: IncomeVsExpenseCardProps) {
  const [showTable, setShowTable] = useState(false);
  const hasData = items.some((item) => Number(item.income) > 0 || Number(item.expense) > 0);

  return (
    <div className="card">
      <div className="card-body">
        <div className="d-flex justify-content-between align-items-start mb-2">
          <h2 className="h6 mb-0">{en.reports.overview.title}</h2>
          {hasData ? (
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setShowTable((v) => !v)}>
              {showTable ? en.reports.viewChart : en.reports.viewTable}
            </button>
          ) : null}
        </div>

        {!hasData ? (
          <EmptyState icon="bi-bar-chart" message={en.reports.overview.empty} />
        ) : showTable ? (
          <table className="table table-sm">
            <caption className="visually-hidden">{en.reports.overview.tableCaption}</caption>
            <thead>
              <tr>
                <th scope="col">{en.reports.overview.colMonth}</th>
                <th scope="col">{en.reports.overview.colIncome}</th>
                <th scope="col">{en.reports.overview.colExpense}</th>
                <th scope="col">{en.reports.overview.colNet}</th>
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
                  <td>
                    <MoneyText {...netMoneyProps(item.net)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ height: '20rem' }}>
            <Suspense fallback={<ChartSkeleton />}>
              <IncomeVsExpenseComboChart items={items} />
            </Suspense>
          </div>
        )}
      </div>
    </div>
  );
}
