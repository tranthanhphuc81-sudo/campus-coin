/**
 * useTransactionFilters.ts
 * URL-synced filter state for the transactions list (`/app/transactions`): every filter, the
 * sort order and the current page live in the URL's query string, so the list is shareable/
 * bookmarkable and survives a reload. `parseFiltersFromParams`/`filtersToParams` are pure so the
 * URL <-> filters mapping can be unit-tested without mounting a router.
 * Exports: useTransactionFilters, parseFiltersFromParams, filtersToParams, TransactionFilters,
 *   SORT_VALUES, PAGE_SIZE
 * Spec: docs/spec/05a §5.4 (BR-TX-08: filters + sort + pagination)
 */
import { TransactionType, type ListTransactionsQueryInput } from '@campuscoin/shared';
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';

export const SORT_VALUES = ['txnDate', '-txnDate', 'amount', '-amount', 'createdAt', '-createdAt'] as const;
export type SortValue = (typeof SORT_VALUES)[number];

export const PAGE_SIZE = 20;

/** The transactions list's filter/sort/page state, all mirrored 1:1 into the URL query string. */
export interface TransactionFilters {
  from?: string;
  to?: string;
  type?: TransactionType;
  categoryId?: number[];
  q?: string;
  minAmount?: string;
  maxAmount?: string;
  sort: SortValue;
  page: number;
}

const DEFAULT_FILTERS: TransactionFilters = { sort: '-txnDate', page: 1 };

/** Reads {@link TransactionFilters} out of a `URLSearchParams`, defaulting anything absent/invalid. */
export function parseFiltersFromParams(params: URLSearchParams): TransactionFilters {
  const type = params.get('type');
  const sort = params.get('sort');
  const page = Number(params.get('page'));
  const categoryId = params.get('categoryId');

  return {
    from: params.get('from') ?? undefined,
    to: params.get('to') ?? undefined,
    type: type === TransactionType.INCOME || type === TransactionType.EXPENSE ? type : undefined,
    categoryId: categoryId
      ? categoryId
          .split(',')
          .map(Number)
          .filter((n) => Number.isInteger(n) && n > 0)
      : undefined,
    q: params.get('q') ?? undefined,
    minAmount: params.get('minAmount') ?? undefined,
    maxAmount: params.get('maxAmount') ?? undefined,
    sort: (SORT_VALUES as readonly string[]).includes(sort ?? '') ? (sort as SortValue) : DEFAULT_FILTERS.sort,
    page: Number.isInteger(page) && page > 0 ? page : DEFAULT_FILTERS.page,
  };
}

/** Serializes {@link TransactionFilters} back into a flat `{ [param]: value }` map for `setSearchParams`. */
export function filtersToParams(filters: TransactionFilters): Record<string, string> {
  const params: Record<string, string> = { sort: filters.sort, page: String(filters.page) };
  if (filters.from) params.from = filters.from;
  if (filters.to) params.to = filters.to;
  if (filters.type) params.type = filters.type;
  if (filters.categoryId?.length) params.categoryId = filters.categoryId.join(',');
  if (filters.q) params.q = filters.q;
  if (filters.minAmount) params.minAmount = filters.minAmount;
  if (filters.maxAmount) params.maxAmount = filters.maxAmount;
  return params;
}

/** Turns {@link TransactionFilters} into the exact query object `listTransactions`/`useTransactionsQuery` expect. */
export function filtersToQuery(filters: TransactionFilters, deleted: boolean): ListTransactionsQueryInput {
  return {
    from: filters.from,
    to: filters.to,
    type: filters.type,
    categoryId: filters.categoryId,
    q: filters.q,
    minAmount: filters.minAmount,
    maxAmount: filters.maxAmount,
    sort: filters.sort,
    page: filters.page,
    limit: PAGE_SIZE,
    deleted,
  };
}

/** Reads/writes the transactions list's filters from/to the current URL. */
export function useTransactionFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => parseFiltersFromParams(searchParams), [searchParams]);

  const setFilters = useCallback(
    (patch: Partial<TransactionFilters>, options?: { resetPage?: boolean }) => {
      const next: TransactionFilters = { ...filters, ...patch, page: options?.resetPage ? 1 : patch.page ?? filters.page };
      setSearchParams(filtersToParams(next), { replace: true });
    },
    [filters, setSearchParams],
  );

  const clearFilters = useCallback(() => setSearchParams(filtersToParams(DEFAULT_FILTERS), { replace: true }), [setSearchParams]);

  return { filters, setFilters, clearFilters };
}
