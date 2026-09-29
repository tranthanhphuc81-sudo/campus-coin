/**
 * BudgetRow.tsx
 * One category's row on the Budgets page: icon/name, editable limit amount + alert threshold,
 * and a progress bar (coloured by the server-computed `BudgetStatus`, always paired with a text
 * percentage — spec §8.5 never colour-only). A category with no budget row yet still renders with
 * empty/default inputs so the user can create one.
 * Exports: BudgetRow, BudgetRowValue
 * Spec: docs/spec/05c §5.11 (budgets & alerts)
 */
import { BUDGET_ALERT_THRESHOLD_MAX, BUDGET_ALERT_THRESHOLD_MIN, type BudgetDto, type CategoryDto } from '@campuscoin/shared';
import { useId } from 'react';
import { MoneyText } from '../../../components/MoneyText';
import { en } from '../../../i18n/en';
import { budgetStatusLabel, budgetStatusProgressClass, budgetStatusTextClass } from '../budgetStatus';

/** Editable state for one category's budget row, kept in the parent page's form state map. */
export interface BudgetRowValue {
  limitAmount: string;
  alertThresholdPct: number;
}

interface BudgetRowProps {
  category: CategoryDto;
  /** The saved budget for this category this month, or `null` if none exists yet. */
  budget: BudgetDto | null;
  value: BudgetRowValue;
  onChange: (value: BudgetRowValue) => void;
}

/** One category's editable limit/threshold plus its current-month consumption progress bar. */
export function BudgetRow({ category, budget, value, onChange }: BudgetRowProps) {
  const limitId = useId();
  const thresholdId = useId();
  const percent = Math.min(100, budget?.percent ?? 0);
  const status = budget?.status ?? 'green';

  return (
    <div className="card mb-2">
      <div className="card-body">
        <div className="row g-2 align-items-end">
          <div className="col-12 col-md-4 d-flex align-items-center gap-2">
            <span
              className="d-inline-flex align-items-center justify-content-center rounded-circle flex-shrink-0"
              style={{ width: '2rem', height: '2rem', backgroundColor: category.color ?? '#6c757d', color: '#fff' }}
            >
              <i className={`bi bi-${category.icon || 'tag'}`} aria-hidden="true" />
            </span>
            <span className="fw-semibold">{category.name}</span>
          </div>
          <div className="col-6 col-md-4">
            <label htmlFor={limitId} className="form-label small">
              {en.budgets.limitLabel}
            </label>
            <input
              id={limitId}
              type="text"
              inputMode="decimal"
              className="form-control form-control-sm"
              value={value.limitAmount}
              onChange={(e) => onChange({ ...value, limitAmount: e.target.value })}
            />
          </div>
          <div className="col-6 col-md-4">
            <label htmlFor={thresholdId} className="form-label small">
              {en.budgets.thresholdLabel}
            </label>
            <input
              id={thresholdId}
              type="number"
              min={BUDGET_ALERT_THRESHOLD_MIN}
              max={BUDGET_ALERT_THRESHOLD_MAX}
              className="form-control form-control-sm"
              value={value.alertThresholdPct}
              onChange={(e) => onChange({ ...value, alertThresholdPct: Number(e.target.value) })}
            />
          </div>
        </div>

        {budget ? (
          <div className="mt-2">
            <div className="d-flex justify-content-between small mb-1">
              <span>
                <MoneyText amount={budget.spent} /> {en.budgets.spentOfLimitSeparator} <MoneyText amount={budget.limitAmount} />
              </span>
              <span className={`fw-semibold ${budgetStatusTextClass(status)}`}>
                {en.budgets.percentLabel(Math.round(budget.percent))} · {budgetStatusLabel(status)}
              </span>
            </div>
            <div className="progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} style={{ height: '0.75rem' }}>
              <div className={`progress-bar ${budgetStatusProgressClass(status)}`} style={{ width: `${percent}%` }} />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
