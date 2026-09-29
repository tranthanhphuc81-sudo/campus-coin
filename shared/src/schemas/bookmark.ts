/**
 * bookmark.ts
 * Zod schemas and DTO types for bookmarking a tip, insight or report view (docs/spec/05c §5.12):
 * `GET/POST/PATCH/DELETE /bookmarks`. `targetRef` identifies the bookmarked object per
 * `targetType` (tip id / insight month / report view+filters) and is validated per-branch with a
 * `discriminatedUnion` so an insight bookmark can't be created with a tip-shaped ref, etc.
 * A report `targetRef` is a small whitelisted string (`"<view>"` or `"<view>?<query>"`), never a
 * full URL — the frontend always rebuilds the actual route from a whitelist map, so this can't be
 * used as an open redirect / injected link.
 * Main exports: REPORT_BOOKMARK_VIEWS, reportTargetRefSchema, createBookmarkSchema,
 *   updateBookmarkSchema, listBookmarksQuerySchema + inferred *Input types, BookmarkDto,
 *   BookmarkListResponse
 * Spec: docs/spec/05c §5.12
 */
import { z } from 'zod';
import type { BookmarkTargetType } from '../enums.js';
import { BOOKMARK_NOTE_MAX_CHARS, BOOKMARK_SEARCH_MAX_CHARS, BOOKMARK_TARGET_REF_MAX, PAGE_NUMBER_MAX, PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX } from '../constants.js';
import { intIdParamSchema, localDateSchema } from './common.js';

/** Upper bound for `user_tips.id` (`BIGINT` signed max). B-L1: bounds the `\d{1,20}` tip id regex
 * below, which otherwise accepts a value far above what a real `BIGINT` column can hold. */
const MAX_BIGINT_ID = 9_223_372_036_854_775_807n;

/** Report tabs that can be bookmarked (`ReportsPage` tab keys). */
export const REPORT_BOOKMARK_VIEWS = ['overview', 'by-period', 'by-category', 'forecast'] as const;
/** Union of {@link REPORT_BOOKMARK_VIEWS} values. */
export type ReportBookmarkView = (typeof REPORT_BOOKMARK_VIEWS)[number];

/**
 * A report bookmark's `targetRef`: `"<view>"` or `"<view>?<canonical query>"`. Whitelisted
 * characters only (`A-Za-z0-9=&,-`), no scheme/host/slash — the frontend never treats this as a
 * URL, it always rebuilds the route from `view` + a parsed, re-validated query.
 */
export const reportTargetRefSchema = z
  .string()
  .max(BOOKMARK_TARGET_REF_MAX, `Report reference must be at most ${BOOKMARK_TARGET_REF_MAX} characters.`)
  // Fixed alternation of known views, so this cannot backtrack catastrophically.
  // eslint-disable-next-line security/detect-unsafe-regex
  .regex(/^(overview|by-period|by-category|forecast)(\?[A-Za-z0-9=&,-]+)?$/, 'Invalid report reference.');
/** Inferred input type of {@link reportTargetRefSchema}. */
export type ReportTargetRefInput = z.infer<typeof reportTargetRefSchema>;

/** Optional note; an empty string is treated as "no note" (`null`) rather than a validation error. */
const noteSchema = z.preprocess(
  (v) => (v === '' ? null : v),
  z
    .string()
    .trim()
    .max(BOOKMARK_NOTE_MAX_CHARS, `Note must be at most ${BOOKMARK_NOTE_MAX_CHARS} characters.`)
    .nullable()
    .optional(),
);

/** Body of `POST /bookmarks` — shape of `targetRef` depends on `targetType`. */
export const createBookmarkSchema = z.discriminatedUnion('targetType', [
  z
    .object({
      targetType: z.literal('tip'),
      // user_tips.id is a BigInt PK (matches tipIdParamSchema's convention).
      targetRef: z
        .string()
        .regex(/^\d{1,20}$/, 'Invalid tip id.')
        .refine((v) => BigInt(v) <= MAX_BIGINT_ID, 'Invalid tip id.'), // B-L1
      note: noteSchema,
    })
    .strict(),
  z
    .object({
      targetType: z.literal('insight'),
      // Caller passes the first-of-month date; localDateSchema already only accepts real calendar
      // dates, the repository/service is responsible for normalising/rejecting a non-day-01 value.
      targetRef: localDateSchema,
      note: noteSchema,
    })
    .strict(),
  z
    .object({
      targetType: z.literal('report'),
      targetRef: reportTargetRefSchema,
      note: noteSchema,
    })
    .strict(),
]);
/** Inferred input type of {@link createBookmarkSchema}. */
export type CreateBookmarkInput = z.infer<typeof createBookmarkSchema>;

/** Body of `PATCH /bookmarks/:id` — only the note can be edited (`targetType`/`targetRef` are immutable). */
export const updateBookmarkSchema = z.object({ note: noteSchema }).strict();
/** Inferred input type of {@link updateBookmarkSchema}. */
export type UpdateBookmarkInput = z.infer<typeof updateBookmarkSchema>;

/** Route param `{ id }` of `PATCH/DELETE /bookmarks/:id` — `bookmarks.id` is a plain int PK. */
export const bookmarkIdParamSchema = intIdParamSchema;
/** Inferred input type of {@link bookmarkIdParamSchema}. */
export type BookmarkIdParamInput = z.infer<typeof bookmarkIdParamSchema>;

/** Query of `GET /bookmarks?type=&q=&page=&limit=`. */
export const listBookmarksQuerySchema = z
  .object({
    type: z.enum(['tip', 'insight', 'report']).optional(),
    q: z.string().trim().min(1).max(BOOKMARK_SEARCH_MAX_CHARS).optional(),
    page: z.coerce.number().int().min(1).max(PAGE_NUMBER_MAX).default(1), // B-L8: bounds an unbounded OFFSET.
    limit: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(PAGE_SIZE_DEFAULT),
  })
  .strict();
/** Inferred input type of {@link listBookmarksQuerySchema}. */
export type ListBookmarksQuery = z.infer<typeof listBookmarksQuerySchema>;

/** Shape of a bookmark as returned by the API, with its target's current display info. */
export interface BookmarkDto {
  id: number;
  targetType: BookmarkTargetType;
  targetRef: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  /** Live lookup of the bookmarked object; `available: false` when it was since deleted/expired. */
  target: { available: boolean; title: string | null; excerpt: string | null };
}

/** Response body of `GET /bookmarks`, matching the `{ data, meta }` pagination shape used by
 * `GET /imports/:id`'s `rows` field. */
export interface BookmarkListResponse {
  data: BookmarkDto[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}
