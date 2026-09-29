/**
 * CategoryBreakdownFiltersBar.tsx
 * Filter controls for the "By category" report: date-range presets + custom range, type,
 * multi-select categories — all controlled by `useCategoryBreakdownFilters` (URL-synced), mirroring
 * `features/transactions/components/TransactionFiltersBar.tsx`'s preset pattern.
 * Exports: CategoryBreakdownFiltersBar
 * Spec: docs/spec/05b §5.8 (shared filters, reflected to the URL)
 */
import { TransactionType } from '@campuscoin/shared';
import { useCategoriesQuery } from '../../categories/hooks';
import { en } from '../../../i18n/en';
import { todayLocalDate } from '../../../lib/dates';
import type { CategoryBreakdownFilters } from '../useCategoryBreakdownFilters';

interface CategoryBreakdownFiltersBarProps {
  filters: CategoryBreakdownFilters;
  onChange: (patch: Partial<CategoryBreakdownFilters>) => void;
}

function startOfMonth(monthsAgo: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsAgo, 1);
  return d.toISOString().slice(0, 10);
}

function endOfMonth(monthsAgo: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsAgo + 1, 0);
  return d.toISOString().slice(0, 10);
}

/** Date-range presets + type + multi-select categories for the "By category" report. */
export function CategoryBreakdownFiltersBar({ filters, onChange }: CategoryBreakdownFiltersBarProps) {
  const categoriesQuery = useCategoriesQuery({ type: filters.type, includeInactive: true });
  const categories = categoriesQuery.data ?? [];
  const t = en.reports.byCategory;

  function applyPreset(from: string, to: string) {
    onChange({ from, to });
  }

  return (
    <div className="card mb-3">
      <div className="card-body">
        <div className="row g-2 mb-2">
          <div className="col-6 col-md-3">
            <label htmlFor="rbc-from" className="form-label small">
              {t.dateFrom}
            </label>
            <input id="rbc-from" type="date" className="form-control form-control-sm" value={filters.from} onChange={(e) => onChange({ from: e.target.value })} />
          </div>
          <div className="col-6 col-md-3">
            <label htmlFor="rbc-to" className="form-label small">
              {t.dateTo}
            </label>
            <input id="rbc-to" type="date" className="form-control form-control-sm" value={filters.to} onChange={(e) => onChange({ to: e.target.value })} />
          </div>
          <div className="col-12 col-md-6 d-flex flex-wrap align-items-end gap-2">
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => applyPreset(startOfMonth(0), todayLocalDate())}>
              {t.presetThisMonth}
            </button>
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => applyPreset(startOfMonth(1), endOfMonth(1))}>
              {t.presetLastMonth}
            </button>
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => applyPreset(startOfMonth(2), todayLocalDate())}>
              {t.preset3Months}
            </button>
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => applyPreset(startOfMonth(5), todayLocalDate())}>
              {t.preset6Months}
            </button>
          </div>
        </div>

        <div className="row g-2">
          <div className="col-6 col-md-3">
            <label htmlFor="rbc-type" className="form-label small">
              {t.type}
            </label>
            <select
              id="rbc-type"
              className="form-select form-select-sm"
              value={filters.type ?? ''}
              onChange={(e) => onChange({ type: (e.target.value as TransactionType) || undefined, categoryId: undefined })}
            >
              <option value={TransactionType.EXPENSE}>{t.typeExpense}</option>
              <option value={TransactionType.INCOME}>{t.typeIncome}</option>
            </select>
          </div>
          <div className="col-6 col-md-4">
            <label htmlFor="rbc-categories" className="form-label small">
              {t.categories}
            </label>
            <select
              id="rbc-categories"
              multiple
              className="form-select form-select-sm"
              value={(filters.categoryId ?? []).map(String)}
              onChange={(e) => onChange({ categoryId: Array.from(e.target.selectedOptions, (o) => Number(o.value)) })}
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
