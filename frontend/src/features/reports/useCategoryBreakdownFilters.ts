/**
 * useCategoryBreakdownFilters.ts
 * URL-synced filter state for the "By category" report (docs/spec/05b §5.8: "bộ lọc... phản ánh
 * lên URL query để chia sẻ/bookmark trạng thái"). Mirrors `features/transactions
 * /useTransactionFilters.ts`'s pure-parse/pure-serialize split so the URL <-> filters mapping is
 * unit-testable without mounting a router.
 * Exports: useCategoryBreakdownFilters, parseFiltersFromParams, filtersToParams,
 *   CategoryBreakdownFilters
 * Spec: docs/spec/05b §5.8
 */
import { TransactionType } from '@campuscoin/shared';
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { currentLocalMonth, todayLocalDate } from '../../lib/dates';

/** The "By category" report's filter state, mirrored 1:1 into the URL query string. */
export interface CategoryBreakdownFilters {
  from: string;
  to: string;
  type?: TransactionType;
  categoryId?: number[];
}

function defaultFilters(): CategoryBreakdownFilters {
  return { from: currentLocalMonth(), to: todayLocalDate(), type: TransactionType.EXPENSE };
}

/** Reads {@link CategoryBreakdownFilters} out of a `URLSearchParams`, defaulting anything absent/invalid. */
export function parseFiltersFromParams(params: URLSearchParams): CategoryBreakdownFilters {
  const defaults = defaultFilters();
  const type = params.get('type');
  const categoryId = params.get('categoryId');

  return {
    from: params.get('from') ?? defaults.from,
    to: params.get('to') ?? defaults.to,
    // The UI's own <select> never offers an "all types" option, so an absent `type` param means
    // "not set yet", not "cleared" — fall back to the default (expense) rather than undefined
    // (which would silently mix income into an expense-only breakdown).
    type: type === TransactionType.INCOME || type === TransactionType.EXPENSE ? type : defaults.type,
    categoryId: categoryId
      ? categoryId
          .split(',')
          .map(Number)
          .filter((n) => Number.isInteger(n) && n > 0)
      : undefined,
  };
}

/** Serializes {@link CategoryBreakdownFilters} back into a flat `{ [param]: value }` map. */
export function filtersToParams(filters: CategoryBreakdownFilters): Record<string, string> {
  const params: Record<string, string> = { from: filters.from, to: filters.to };
  if (filters.type) params.type = filters.type;
  if (filters.categoryId?.length) params.categoryId = filters.categoryId.join(',');
  return params;
}

/** Reads/writes the "By category" report's filters from/to the current URL. */
export function useCategoryBreakdownFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => parseFiltersFromParams(searchParams), [searchParams]);

  const setFilters = useCallback(
    (patch: Partial<CategoryBreakdownFilters>) => {
      setSearchParams(filtersToParams({ ...filters, ...patch }), { replace: true });
    },
    [filters, setSearchParams],
  );

  return { filters, setFilters };
}
