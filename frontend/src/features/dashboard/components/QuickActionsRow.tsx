/**
 * QuickActionsRow.tsx
 * Dashboard quick-actions row: "Add income"/"Add expense" open the app-wide quick-add modal
 * (`useQuickAdd`), "Import CSV" links to the CSV import wizard page (P11 builds its real wizard;
 * P09 links to its already-routed placeholder rather than omitting the action entirely).
 * Exports: QuickActionsRow
 * Spec: docs/spec/05b §5.7 Bảng 21
 */
import { Link } from 'react-router';
import { useQuickAdd } from '../../transactions/components/QuickAddContext';
import { en } from '../../../i18n/en';

/** Row of quick-action buttons shown near the top of the dashboard. */
export function QuickActionsRow() {
  const { open } = useQuickAdd();

  return (
    <div className="d-flex flex-wrap gap-2 mb-3">
      <button type="button" className="btn btn-primary btn-sm" onClick={open}>
        <i className="bi bi-plus-lg me-1" aria-hidden="true" />
        {en.dashboard.quickActions.addIncome}
      </button>
      <button type="button" className="btn btn-outline-primary btn-sm" onClick={open}>
        <i className="bi bi-plus-lg me-1" aria-hidden="true" />
        {en.dashboard.quickActions.addExpense}
      </button>
      <Link to="/app/transactions/import" className="btn btn-outline-secondary btn-sm">
        <i className="bi bi-upload me-1" aria-hidden="true" />
        {en.dashboard.quickActions.importCsv}
      </Link>
    </div>
  );
}
