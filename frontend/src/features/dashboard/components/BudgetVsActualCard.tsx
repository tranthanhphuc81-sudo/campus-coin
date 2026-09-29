/**
 * BudgetVsActualCard.tsx
 * Dashboard "Budget vs actual" widget: reuses the same `BudgetDto[]` the Budgets page reads
 * (`DashboardSummaryDto.budgets`, avoiding a second fetch of the same data), one progress bar per
 * budgeted category, coloured by the server-computed `BudgetStatus` (never recomputed client-side).
 * Exports: BudgetVsActualCard
 * Spec: docs/spec/05b §5.7 Bảng 21 · docs/spec/08 §8.5 (never colour-only)
 */
import type { BudgetDto } from '@campuscoin/shared';
import { Link } from 'react-router';
import { EmptyState } from '../../../components/EmptyState';
import { en } from '../../../i18n/en';
import { budgetStatusLabel, budgetStatusProgressClass, budgetStatusTextClass } from '../../budgets/budgetStatus';

interface BudgetVsActualCardProps {
  budgets: BudgetDto[];
}

/** "Budget vs actual" widget: one progress bar per budgeted category, linking to the full Budgets page. */
export function BudgetVsActualCard({ budgets }: BudgetVsActualCardProps) {
  return (
    <div className="card h-100">
      <div className="card-body">
        <div className="d-flex justify-content-between align-items-start mb-2">
          <h2 className="h6 mb-0">{en.dashboard.budgetVsActual.title}</h2>
          <Link to="/app/budgets" className="small">
            {en.dashboard.budgetVsActual.manageLink}
          </Link>
        </div>
        {budgets.length === 0 ? (
          <EmptyState icon="bi-wallet2" message={en.dashboard.budgetVsActual.empty} />
        ) : (
          budgets.map((budget) => {
            const percent = Math.min(100, budget.percent);
            return (
              <div key={budget.id} className="mb-2">
                <div className="d-flex justify-content-between small mb-1">
                  <span>{budget.category.name}</span>
                  <span className={`fw-semibold ${budgetStatusTextClass(budget.status)}`}>
                    {Math.round(budget.percent)}% · {budgetStatusLabel(budget.status)}
                  </span>
                </div>
                <div className="progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} style={{ height: '0.5rem' }}>
                  <div className={`progress-bar ${budgetStatusProgressClass(budget.status)}`} style={{ width: `${percent}%` }} />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
