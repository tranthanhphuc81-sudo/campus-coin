/**
 * useTransactionFilters.test.ts
 * Verifies: the transactions list's filters round-trip through the URL query string (parse <->
 * serialize), invalid/missing params fall back to defaults, and `filtersToQuery` produces the
 * exact shape `listTransactions` expects.
 * Spec: docs/spec/05a §5.4 (BR-TX-08)
 */
import { describe, expect, it } from 'vitest';
import { filtersToParams, filtersToQuery, parseFiltersFromParams, type TransactionFilters } from './useTransactionFilters';

describe('parseFiltersFromParams', () => {
  it('defaults to sort=-txnDate and page=1 when the URL has no params', () => {
    expect(parseFiltersFromParams(new URLSearchParams())).toEqual({
      from: undefined,
      to: undefined,
      type: undefined,
      categoryId: undefined,
      q: undefined,
      minAmount: undefined,
      maxAmount: undefined,
      sort: '-txnDate',
      page: 1,
    });
  });

  it('reads every filter from the URL', () => {
    const params = new URLSearchParams({
      from: '2026-09-01',
      to: '2026-09-30',
      type: 'expense',
      categoryId: '3,7,12',
      q: 'coffee',
      minAmount: '5',
      maxAmount: '50',
      sort: 'amount',
      page: '2',
    });
    expect(parseFiltersFromParams(params)).toEqual({
      from: '2026-09-01',
      to: '2026-09-30',
      type: 'expense',
      categoryId: [3, 7, 12],
      q: 'coffee',
      minAmount: '5',
      maxAmount: '50',
      sort: 'amount',
      page: 2,
    });
  });

  it('falls back to defaults for an invalid type/sort/page instead of throwing', () => {
    const params = new URLSearchParams({ type: 'bogus', sort: 'bogus', page: '-5' });
    const filters = parseFiltersFromParams(params);
    expect(filters.type).toBeUndefined();
    expect(filters.sort).toBe('-txnDate');
    expect(filters.page).toBe(1);
  });

  it('drops non-positive-integer category ids', () => {
    const params = new URLSearchParams({ categoryId: '3,-1,abc,7' });
    expect(parseFiltersFromParams(params).categoryId).toEqual([3, 7]);
  });
});

describe('filtersToParams', () => {
  it('omits absent optional filters and always includes sort + page', () => {
    const filters: TransactionFilters = { sort: '-txnDate', page: 1 };
    expect(filtersToParams(filters)).toEqual({ sort: '-txnDate', page: '1' });
  });

  it('round-trips a fully populated filter set through parse <-> serialize', () => {
    const filters: TransactionFilters = {
      from: '2026-01-01',
      to: '2026-01-31',
      type: 'income',
      categoryId: [1, 2],
      q: 'salary',
      minAmount: '0',
      maxAmount: '1000',
      sort: '-amount',
      page: 3,
    };
    const params = new URLSearchParams(filtersToParams(filters));
    expect(parseFiltersFromParams(params)).toEqual(filters);
  });
});

describe('filtersToQuery', () => {
  it('adds the fixed page size and deleted flag on top of the filters', () => {
    const filters: TransactionFilters = { sort: '-txnDate', page: 2, q: 'bus' };
    expect(filtersToQuery(filters, false)).toEqual({
      from: undefined,
      to: undefined,
      type: undefined,
      categoryId: undefined,
      q: 'bus',
      minAmount: undefined,
      maxAmount: undefined,
      sort: '-txnDate',
      page: 2,
      limit: 20,
      deleted: false,
    });
  });

  it('reads the Trash via deleted: true', () => {
    expect(filtersToQuery({ sort: '-txnDate', page: 1 }, true).deleted).toBe(true);
  });
});
