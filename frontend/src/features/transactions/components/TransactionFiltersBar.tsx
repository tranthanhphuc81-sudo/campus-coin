/**
 * TransactionFiltersBar.tsx
 * Filter/sort controls for the transactions list: date-range presets + custom range, type,
 * multi-select categories, amount range, description search and sort — all controlled by
 * `useTransactionFilters` (URL-synced) so state lives in the URL, not this component.
 * Exports: TransactionFiltersBar
 * Spec: docs/spec/05a §5.4 (BR-TX-08) · docs/spec/08 §8.3 (transactions filter bar)
 */
import { TransactionType } from '@campuscoin/shared';
import { useCategoriesQuery } from '../../categories/hooks';
import { en } from '../../../i18n/en';
import { todayLocalDate } from '../../../lib/dates';
import { SORT_VALUES, type SortValue, type TransactionFilters } from '../useTransactionFilters';

interface TransactionFiltersBarProps {
  filters: TransactionFilters;
  onChange: (patch: Partial<TransactionFilters>, options?: { resetPage?: boolean }) => void;
  onClear: () => void;
}

const SORT_LABELS: Record<SortValue, string> = {
  '-txnDate': en.transactions.filters.sortDateDesc,
  txnDate: en.transactions.filters.sortDateAsc,
  '-amount': en.transactions.filters.sortAmountDesc,
  amount: en.transactions.filters.sortAmountAsc,
  '-createdAt': en.transactions.filters.sortDateDesc,
  createdAt: en.transactions.filters.sortDateAsc,
};

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
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

/** Filter bar for the transactions list: presets, type, categories, amount range, search, sort. */
export function TransactionFiltersBar({ filters, onChange, onClear }: TransactionFiltersBarProps) {
  const categoriesQuery = useCategoriesQuery({});
  const categories = categoriesQuery.data ?? [];

  function applyPreset(from: string, to: string) {
    onChange({ from, to }, { resetPage: true });
  }

  return (
    <div className="card mb-3">
      <div className="card-body">
        <div className="row g-2 mb-2">
          <div className="col-6 col-md-3">
            <label htmlFor="filter-from" className="form-label small">
              {en.transactions.filters.dateFrom}
            </label>
            <input
              id="filter-from"
              type="date"
              className="form-control form-control-sm"
              value={filters.from ?? ''}
              onChange={(e) => onChange({ from: e.target.value || undefined }, { resetPage: true })}
            />
          </div>
          <div className="col-6 col-md-3">
            <label htmlFor="filter-to" className="form-label small">
              {en.transactions.filters.dateTo}
            </label>
            <input
              id="filter-to"
              type="date"
              className="form-control form-control-sm"
              value={filters.to ?? ''}
              onChange={(e) => onChange({ to: e.target.value || undefined }, { resetPage: true })}
            />
          </div>
          <div className="col-12 col-md-6 d-flex flex-wrap align-items-end gap-2">
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => applyPreset(todayLocalDate(), todayLocalDate())}>
              {en.transactions.filters.presetToday}
            </button>
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => applyPreset(isoDaysAgo(6), todayLocalDate())}>
              {en.transactions.filters.presetThisWeek}
            </button>
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => applyPreset(startOfMonth(0), todayLocalDate())}>
              {en.transactions.filters.presetThisMonth}
            </button>
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => applyPreset(startOfMonth(1), endOfMonth(1))}>
              {en.transactions.filters.presetLastMonth}
            </button>
          </div>
        </div>

        <div className="row g-2 mb-2">
          <div className="col-6 col-md-2">
            <label htmlFor="filter-type" className="form-label small">
              {en.transactions.filters.type}
            </label>
            <select
              id="filter-type"
              className="form-select form-select-sm"
              value={filters.type ?? ''}
              onChange={(e) => onChange({ type: (e.target.value as TransactionType) || undefined }, { resetPage: true })}
            >
              <option value="">{en.transactions.filters.typeAll}</option>
              <option value={TransactionType.EXPENSE}>{en.transactions.form.typeExpense}</option>
              <option value={TransactionType.INCOME}>{en.transactions.form.typeIncome}</option>
            </select>
          </div>
          <div className="col-6 col-md-3">
            <label htmlFor="filter-categories" className="form-label small">
              {en.transactions.filters.categories}
            </label>
            <select
              id="filter-categories"
              multiple
              className="form-select form-select-sm"
              value={(filters.categoryId ?? []).map(String)}
              onChange={(e) =>
                onChange(
                  { categoryId: Array.from(e.target.selectedOptions, (o) => Number(o.value)) },
                  { resetPage: true },
                )
              }
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          <div className="col-6 col-md-2">
            <label htmlFor="filter-min" className="form-label small">
              {en.transactions.filters.amountMin}
            </label>
            <input
              id="filter-min"
              type="text"
              inputMode="decimal"
              className="form-control form-control-sm"
              value={filters.minAmount ?? ''}
              onChange={(e) => onChange({ minAmount: e.target.value || undefined }, { resetPage: true })}
            />
          </div>
          <div className="col-6 col-md-2">
            <label htmlFor="filter-max" className="form-label small">
              {en.transactions.filters.amountMax}
            </label>
            <input
              id="filter-max"
              type="text"
              inputMode="decimal"
              className="form-control form-control-sm"
              value={filters.maxAmount ?? ''}
              onChange={(e) => onChange({ maxAmount: e.target.value || undefined }, { resetPage: true })}
            />
          </div>
          <div className="col-12 col-md-3">
            <label htmlFor="filter-sort" className="form-label small">
              {en.transactions.filters.sort}
            </label>
            <select
              id="filter-sort"
              className="form-select form-select-sm"
              value={filters.sort}
              onChange={(e) => onChange({ sort: e.target.value as SortValue })}
            >
              {SORT_VALUES.filter((v) => !v.includes('createdAt')).map((value) => (
                <option key={value} value={value}>
                  {SORT_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="row g-2 align-items-end">
          <div className="col-8 col-md-4">
            <label htmlFor="filter-search" className="form-label small">
              {en.transactions.filters.search}
            </label>
            <input
              id="filter-search"
              type="search"
              className="form-control form-control-sm"
              placeholder={en.transactions.filters.searchPlaceholder}
              value={filters.q ?? ''}
              onChange={(e) => onChange({ q: e.target.value || undefined }, { resetPage: true })}
            />
          </div>
          <div className="col-4 col-md-2">
            <button type="button" className="btn btn-outline-secondary btn-sm w-100" onClick={onClear}>
              {en.transactions.filters.clear}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
