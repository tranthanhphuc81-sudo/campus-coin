/**
 * pagination.ts
 * Parses `page`/`limit` query params into a Prisma-ready `{skip, take}` and builds the
 * `meta` object every paginated list response returns.
 * Main exports: parsePagination, buildPaginationMeta, PaginationMeta
 * Spec: docs/spec/07 §7.1 (Table 40 – pagination)
 */
import { PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX } from '@campuscoin/shared';

export interface Pagination {
  page: number;
  limit: number;
  skip: number;
  take: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** Parses a positive integer from a query value, falling back to `fallback` when invalid/absent. */
function toPositiveInt(value: unknown, fallback: number): number {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/**
 * Reads `page`/`limit` from a parsed query object, clamping `limit` to `PAGE_SIZE_MAX`.
 * @param query - `req.validated?.query` (or any object with `page`/`limit`).
 */
export function parsePagination(query: { page?: unknown; limit?: unknown } = {}): Pagination {
  const page = toPositiveInt(query.page, 1);
  const limit = Math.min(toPositiveInt(query.limit, PAGE_SIZE_DEFAULT), PAGE_SIZE_MAX);
  return { page, limit, skip: (page - 1) * limit, take: limit };
}

/** Builds the `meta` object returned alongside every paginated list. */
export function buildPaginationMeta(page: number, limit: number, total: number): PaginationMeta {
  return { page, limit, total, totalPages: limit > 0 ? Math.ceil(total / limit) : 0 };
}
