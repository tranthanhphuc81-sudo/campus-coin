/**
 * bookmarks.repository.ts
 * Prisma access for bookmarked tips/insights/report views (docs/spec/05c §5.12). Every method
 * takes `userId` in its `where` (CLAUDE.md: never trust client params for ownership) — a bookmark
 * owned by another user is simply never matched, which is how the service layer turns cross-tenant
 * access into a 404 instead of a 403.
 * Main exports: bookmarksRepository, Db, CreateBookmarkData, ListBookmarksFilters
 * Spec: docs/spec/05c §5.12
 */
import type { BookmarkTargetType } from '@campuscoin/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import type { BookmarkModel } from '../../generated/prisma/models/Bookmark.js';
import type { AppPrismaClient } from '../../lib/prisma.js';
import { prisma } from '../../lib/prisma.js';

/** Either the shared client or a transaction handle — every method accepts both. */
export type Db = AppPrismaClient | Prisma.TransactionClient;

/** Fields accepted by {@link bookmarksRepository.create}. */
export interface CreateBookmarkData {
  userId: string;
  targetType: BookmarkTargetType;
  targetRef: string;
  note: string | null;
}

/** Optional filters accepted by {@link bookmarksRepository.list}/{@link bookmarksRepository.count}. */
export interface ListBookmarksFilters {
  type?: BookmarkTargetType;
  q?: string;
}

/**
 * Escapes MySQL `LIKE` metacharacters in a user-supplied search term, mirroring
 * `transactions.repository.ts`'s own `escapeLike` (BR-TX-08's same reasoning applies to note
 * search): MySQL's default `LIKE` escape character is backslash, which Prisma's `contains` does
 * not apply itself. The table's default collation (`utf8mb4_0900_ai_ci`) is already
 * case-insensitive, so no extra `mode` option is needed (MySQL has none anyway).
 */
function escapeLike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/** Builds the `where` clause shared by `list` and `count`. */
function buildWhere(userId: string, filters: ListBookmarksFilters): Prisma.BookmarkWhereInput {
  return {
    userId,
    ...(filters.type ? { targetType: filters.type } : {}),
    ...(filters.q ? { note: { contains: escapeLike(filters.q) } } : {}),
  };
}

export const bookmarksRepository = {
  /** A bookmark owned by `userId` — never matches another user's row (gives the 404). */
  findOwned(id: number, userId: string, db: Db = prisma): Promise<BookmarkModel | null> {
    return db.bookmark.findFirst({ where: { id, userId } });
  },

  /** One page of the caller's bookmarks, newest first, optionally filtered by `type`/note `q`. */
  list(userId: string, filters: ListBookmarksFilters, skip: number, take: number, db: Db = prisma): Promise<BookmarkModel[]> {
    return db.bookmark.findMany({ where: buildWhere(userId, filters), orderBy: { createdAt: 'desc' }, skip, take });
  },

  /** Count matching `list`'s filters, for pagination `meta`. */
  count(userId: string, filters: ListBookmarksFilters, db: Db = prisma): Promise<number> {
    return db.bookmark.count({ where: buildWhere(userId, filters) });
  },

  /** Total bookmarks owned by `userId`, ignoring filters — the {@link BOOKMARKS_MAX_PER_USER} cap check. */
  countAll(userId: string, db: Db = prisma): Promise<number> {
    return db.bookmark.count({ where: { userId } });
  },

  /** Creates a bookmark. A `(userId, targetType, targetRef)` clash throws Prisma `P2002`, left to bubble up. */
  create(data: CreateBookmarkData, db: Db = prisma): Promise<BookmarkModel> {
    return db.bookmark.create({ data });
  },

  /** Updates a bookmark's note (ownership enforced by the `where`; `count: 0` means not found/not owned). */
  updateNote(id: number, userId: string, note: string | null, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.bookmark.updateMany({ where: { id, userId }, data: { note } });
  },

  /** Hard-deletes a bookmark (ownership enforced by the `where`; `count: 0` means not found/not owned). */
  delete(id: number, userId: string, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.bookmark.deleteMany({ where: { id, userId } });
  },
};
