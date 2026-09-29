/**
 * CategoryBreakdownCard.tsx
 * "By category" report card: lazy-loaded Chart.js doughnut with a "View as table" toggle, plus
 * the overall vs-previous-period comparison line (docs/spec/05b §5.8: "so sánh với kỳ trước").
 * Exports: CategoryBreakdownCard
 * Spec: docs/spec/05b §5.8 · docs/spec/08 §8.5 (accessibility)
 */
import type { ReportCategoryBreakdownDto } from '@campuscoin/shared';
import { lazy, Suspense, useState } from 'react';
import { EmptyState } from '../../../components/EmptyState';
import { MoneyText } from '../../../components/MoneyText';
import { ChartSkeleton } from '../../../components/Skeletons';
import { en } from '../../../i18n/en';

const CategoryDoughnutChart = lazy(() => import('./charts/CategoryDoughnutChart'));

interface CategoryBreakdownCardProps {
  report: ReportCategoryBreakdownDto;
}

/** Formats a signed % change, e.g. "+30%" / "−12%" (never a bare "-12%" minus sign). */
function formatChangePct(pct: number | null): string {
  if (pct === null) return '—';
  return `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${Math.abs(pct)}%`;
}

/** Doughnut chart by default, with a "View as table" toggle and an overall period comparison. */
export function CategoryBreakdownCard({ report }: CategoryBreakdownCardProps) {
  const [showTable, setShowTable] = useState(false);
  const t = en.reports.byCategory;

  return (
    <div className="card">
      <div className="card-body">
        <div className="d-flex justify-content-between align-items-start mb-2">
          <div>
            <h2 className="h6 mb-1">{t.title}</h2>
            <p className="small text-body-secondary mb-0">{en.reports.byCategory.comparisonLabel(report.changePct)}</p>
          </div>
          {report.items.length > 0 ? (
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setShowTable((v) => !v)}>
              {showTable ? en.reports.viewChart : en.reports.viewTable}
            </button>
          ) : null}
        </div>

        {report.items.length === 0 ? (
          <EmptyState icon="bi-pie-chart" message={t.empty} />
        ) : showTable ? (
          <table className="table table-sm">
            <caption className="visually-hidden">{t.tableCaption}</caption>
            <thead>
              <tr>
                <th scope="col">{t.colCategory}</th>
                <th scope="col">{t.colAmount}</th>
                <th scope="col">{t.colShare}</th>
                <th scope="col">{t.colCount}</th>
                <th scope="col">{t.colPrevious}</th>
                <th scope="col">{t.colChange}</th>
              </tr>
            </thead>
            <tbody>
              {report.items.map((item) => (
                <tr key={item.categoryId}>
                  <td>{item.name}</td>
                  <td>
                    <MoneyText amount={item.amount} />
                  </td>
                  <td>{item.sharePct}%</td>
                  <td>{item.transactionCount}</td>
                  <td>
                    <MoneyText amount={item.previousAmount} />
                  </td>
                  <td>{formatChangePct(item.changePct)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">{t.totalLabel}</th>
                <td>
                  <MoneyText amount={report.totalAmount} />
                </td>
                <td>100%</td>
                <td>{report.totalTransactionCount}</td>
                <td>
                  <MoneyText amount={report.previousTotalAmount} />
                </td>
                <td>{formatChangePct(report.changePct)}</td>
              </tr>
            </tfoot>
          </table>
        ) : (
          <div style={{ height: '20rem' }}>
            <Suspense fallback={<ChartSkeleton />}>
              <CategoryDoughnutChart items={report.items} />
            </Suspense>
          </div>
        )}
      </div>
    </div>
  );
}
