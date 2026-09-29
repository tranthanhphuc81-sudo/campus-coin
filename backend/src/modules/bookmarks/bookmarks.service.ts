/**
 * bookmarks.service.ts
 * Business logic for bookmarking tips/insights/report views (docs/spec/05c §5.12): create (with a
 * per-target existence check and the {@link BOOKMARKS_MAX_PER_USER} cap), update note, delete, and
 * list (with per-row target enrichment — title/excerpt looked up live, `available:false` once the
 * target no longer exists). A bookmark not owned by the caller is a 404, never a 403; bookmarking a
 * tip/insight the caller cannot otherwise see is also a 404 (CLAUDE.md cross-tenant invariant).
 * Main exports: create, update, remove, list
 * Spec: docs/spec/05c §5.12
 */
import {
  BOOKMARKS_MAX_PER_USER,
  BookmarkTargetType,
  type BookmarkDto,
  type BookmarkListResponse,
  type CreateBookmarkInput,
  type ListBookmarksQuery,
  type UpdateBookmarkInput,
} from '@campuscoin/shared';
import { Prisma } from '../../generated/prisma/client.js';
import type { BookmarkModel } from '../../generated/prisma/models/Bookmark.js';
import { buildPaginationMeta, parsePagination } from '../../lib/pagination.js';
import { conflict, notFound } from '../../lib/problem.js';
import * as insightsService from '../insights/insights.service.js';
import * as tipsService from '../tips/tips.service.js';
import { bookmarksRepository, type ListBookmarksFilters } from './bookmarks.repository.js';
import { toBookmarkDto, type BookmarkTargetInfo } from './bookmarks.mapper.js';

/** A report bookmark's target is never re-checked for existence — it's just a UI view + filters. */
const ALWAYS_AVAILABLE_TARGET: BookmarkTargetInfo = { available: true, title: null, excerpt: null };
/** Shared "target no longer exists" shape for a stale tip/insight bookmark. */
const UNAVAILABLE_TARGET: BookmarkTargetInfo = { available: false, title: null, excerpt: null };

/**
 * Confirms `input.targetRef` refers to something `userId` can actually see, per `targetType` — a
 * report reference has nothing to check. An insight `targetRef` that isn't a real first-of-month
 * date simply never matches any row (`insights.month` is always day 1), so it 404s here too,
 * without needing a separate "must be day 1" check (per `bookmark.ts`'s own schema comment).
 * @throws {AppError} 404 when the tip/insight doesn't exist or isn't owned by `userId`.
 */
async function assertTargetVisible(userId: string, input: CreateBookmarkInput): Promise<void> {
  if (input.targetType === BookmarkTargetType.TIP) {
    if (!(await tipsService.existsForUser(userId, BigInt(input.targetRef)))) throw notFound('Tip not found.');
  } else if (input.targetType === BookmarkTargetType.INSIGHT) {
    if (!(await insightsService.existsForUser(userId, input.targetRef))) throw notFound('Insight not found.');
  }
}

/**
 * `POST /bookmarks`.
 * @throws {AppError} 409 conflict at the {@link BOOKMARKS_MAX_PER_USER} cap, or on a duplicate
 *   `(targetType, targetRef)`; 404 when a tip/insight target isn't visible to the caller.
 */
export async function create(userId: string, input: CreateBookmarkInput): Promise<BookmarkDto> {
  if ((await bookmarksRepository.countAll(userId)) >= BOOKMARKS_MAX_PER_USER) {
    throw conflict('You have reached the maximum number of saved items.');
  }

  await assertTargetVisible(userId, input);

  let row: BookmarkModel;
  try {
    row = await bookmarksRepository.create({ userId, targetType: input.targetType, targetRef: input.targetRef, note: input.note ?? null });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw conflict('Already saved.');
    throw err;
  }

  // Existence was already confirmed above for tip/insight; `title`/`excerpt` stay null here (only
  // `list()` pays for the extra lookup) — documented simplification, the create response's caller
  // (the "bookmark this" button) already has the target on screen and doesn't need them echoed back.
  return toBookmarkDto(row, ALWAYS_AVAILABLE_TARGET);
}

/**
 * `PATCH /bookmarks/:id` — only the note can change.
 * @throws {AppError} 404 when not found/not owned.
 */
export async function update(userId: string, id: number, input: UpdateBookmarkInput): Promise<BookmarkDto> {
  const result = await bookmarksRepository.updateNote(id, userId, input.note ?? null);
  if (result.count === 0) throw notFound('Bookmark not found.');
  const row = await bookmarksRepository.findOwned(id, userId);
  if (!row) throw notFound('Bookmark not found.'); // defensive: updateNote just matched this exact row
  const [dto] = await enrichRows(userId, [row]);
  return dto as BookmarkDto;
}

/**
 * `DELETE /bookmarks/:id`.
 * @throws {AppError} 404 when not found/not owned.
 */
export async function remove(userId: string, id: number): Promise<void> {
  const result = await bookmarksRepository.delete(id, userId);
  if (result.count === 0) throw notFound('Bookmark not found.');
}

/**
 * Batch-enriches a page of rows: groups tip/insight ids, fetches each group's title/excerpt in one
 * call per type (never N+1), and maps every row to its DTO. A tip/insight id with no match in its
 * group's summary map means the target was since deleted — surfaced as `available: false`.
 */
async function enrichRows(userId: string, rows: BookmarkModel[]): Promise<BookmarkDto[]> {
  const tipIds = rows.filter((r) => r.targetType === BookmarkTargetType.TIP).map((r) => r.targetRef);
  const insightMonths = rows.filter((r) => r.targetType === BookmarkTargetType.INSIGHT).map((r) => r.targetRef);

  const [tipSummaries, insightSummaries] = await Promise.all([
    tipsService.summariesByIds(userId, tipIds),
    insightsService.summariesByMonths(userId, insightMonths),
  ]);

  return rows.map((row) => {
    if (row.targetType === BookmarkTargetType.REPORT) return toBookmarkDto(row, ALWAYS_AVAILABLE_TARGET);
    const summary = (row.targetType === BookmarkTargetType.TIP ? tipSummaries : insightSummaries).get(row.targetRef);
    const target: BookmarkTargetInfo = summary ? { available: true, title: summary.title, excerpt: summary.excerpt } : UNAVAILABLE_TARGET;
    return toBookmarkDto(row, target);
  });
}

/** `GET /bookmarks?type=&q=&page=&limit=` — the caller's own bookmarks, newest first. */
export async function list(userId: string, query: ListBookmarksQuery): Promise<BookmarkListResponse> {
  const { page, limit, skip, take } = parsePagination(query);
  const filters: ListBookmarksFilters = { type: query.type, q: query.q };

  const [rows, total] = await Promise.all([
    bookmarksRepository.list(userId, filters, skip, take),
    bookmarksRepository.count(userId, filters),
  ]);

  return { data: await enrichRows(userId, rows), meta: buildPaginationMeta(page, limit, total) };
}
