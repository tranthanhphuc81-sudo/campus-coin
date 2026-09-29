/**
 * pagination.test.ts
 * Unit tests for backend/src/lib/pagination.ts: defaults, clamping to PAGE_SIZE_MAX, and the
 * `meta` object shape from docs/spec/07 §7.1.
 * Spec: docs/spec/07 §7.1 (Table 40 – pagination)
 */
import { PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX } from '@campuscoin/shared';
import { describe, expect, it } from 'vitest';
import { buildPaginationMeta, parsePagination } from '../../../src/lib/pagination.js';

describe('parsePagination', () => {
  it('defaults to page 1 and the default page size', () => {
    expect(parsePagination({})).toEqual({ page: 1, limit: PAGE_SIZE_DEFAULT, skip: 0, take: PAGE_SIZE_DEFAULT });
  });

  it('computes skip from page and limit', () => {
    expect(parsePagination({ page: '3', limit: '10' })).toEqual({ page: 3, limit: 10, skip: 20, take: 10 });
  });

  it('clamps limit to PAGE_SIZE_MAX', () => {
    expect(parsePagination({ limit: String(PAGE_SIZE_MAX + 500) }).limit).toBe(PAGE_SIZE_MAX);
  });

  it('falls back to defaults for invalid page/limit values', () => {
    expect(parsePagination({ page: '-1', limit: 'abc' })).toEqual({
      page: 1,
      limit: PAGE_SIZE_DEFAULT,
      skip: 0,
      take: PAGE_SIZE_DEFAULT,
    });
  });
});

describe('buildPaginationMeta', () => {
  it('computes totalPages by rounding up', () => {
    expect(buildPaginationMeta(1, 20, 45)).toEqual({ page: 1, limit: 20, total: 45, totalPages: 3 });
  });

  it('returns 0 totalPages for an empty result set', () => {
    expect(buildPaginationMeta(1, 20, 0)).toEqual({ page: 1, limit: 20, total: 0, totalPages: 0 });
  });
});
