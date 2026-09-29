/**
 * bookmarks.mapper.ts
 * Maps a Prisma `Bookmark` row (+ its resolved target display info) to the public
 * {@link BookmarkDto}. The field list is the whitelist — `userId` is never sent to the client
 * (CLAUDE.md security invariant).
 * Main exports: toBookmarkDto, BookmarkTargetInfo
 * Spec: docs/spec/05c §5.12
 */
import type { BookmarkDto, BookmarkTargetType } from '@campuscoin/shared';
import type { BookmarkModel } from '../../generated/prisma/models/Bookmark.js';

/** Live lookup result of a bookmark's target — same shape as {@link BookmarkDto}'s `target` field. */
export interface BookmarkTargetInfo {
  available: boolean;
  title: string | null;
  excerpt: string | null;
}

/**
 * Converts a Prisma `Bookmark` row plus its already-resolved target info into the public
 * {@link BookmarkDto}.
 * @param row - Full row, as read from the DB.
 * @param target - Live enrichment computed by `bookmarks.service.ts` (never derived here).
 */
export function toBookmarkDto(row: BookmarkModel, target: BookmarkTargetInfo): BookmarkDto {
  return {
    id: row.id,
    targetType: row.targetType as BookmarkTargetType,
    targetRef: row.targetRef,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    target,
  };
}
