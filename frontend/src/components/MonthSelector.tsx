/**
 * MonthSelector.tsx
 * Prev/next month navigation control shared by the Budgets and Dashboard pages, both of which
 * scope their data to a single `YYYY-MM-01` month.
 * Exports: MonthSelector
 * Spec: docs/spec/05c §5.11 (budgets) · docs/spec/05b §5.7 (dashboard)
 */
import { en } from '../i18n/en';
import { formatMonthLabel, shiftMonth } from '../lib/dates';

interface MonthSelectorProps {
  /** Current month, `YYYY-MM-01`. */
  month: string;
  onChange: (month: string) => void;
  /** Accessible label for the whole control, e.g. "Budget month". */
  label: string;
}

/** Prev/next buttons plus the current month's label, e.g. "‹ September 2026 ›". */
export function MonthSelector({ month, onChange, label }: MonthSelectorProps) {
  return (
    <div className="d-flex align-items-center gap-2" role="group" aria-label={label}>
      <button
        type="button"
        className="btn btn-outline-secondary btn-sm"
        onClick={() => onChange(shiftMonth(month, -1))}
        aria-label={en.common.previousMonth}
      >
        <i className="bi bi-chevron-left" aria-hidden="true" />
      </button>
      <span className="fw-semibold" aria-live="polite">
        {formatMonthLabel(month)}
      </span>
      <button
        type="button"
        className="btn btn-outline-secondary btn-sm"
        onClick={() => onChange(shiftMonth(month, 1))}
        aria-label={en.common.nextMonth}
      >
        <i className="bi bi-chevron-right" aria-hidden="true" />
      </button>
    </div>
  );
}
