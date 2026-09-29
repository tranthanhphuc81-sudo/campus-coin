/**
 * api.ts
 * Thin wrappers around `/bookmarks` (docs/spec/05c §5.12): create/update/delete/list a bookmark on
 * a tip, insight or report view. Mirrors `features/transactions/api.ts`'s shape.
 * Exports: listBookmarks, createBookmark, updateBookmark, deleteBookmark
 * Spec: docs/spec/05c §5.12
 */
import type { BookmarkDto, BookmarkListResponse, CreateBookmarkInput, ListBookmarksQuery, UpdateBookmarkInput } from '@campuscoin/shared';
import { apiClient } from '../../lib/apiClient/apiClient';

/** `GET /bookmarks?type=&q=&page=&limit=`. */
export async function listBookmarks(query: Partial<ListBookmarksQuery>): Promise<BookmarkListResponse> {
  const response = await apiClient.get<BookmarkListResponse>('/bookmarks', { params: query });
  return response.data;
}

/** `POST /bookmarks` — 409 on a duplicate `(targetType, targetRef)` or at the per-user cap. */
export async function createBookmark(input: CreateBookmarkInput): Promise<BookmarkDto> {
  const response = await apiClient.post<BookmarkDto>('/bookmarks', input);
  return response.data;
}

/** `PATCH /bookmarks/:id` — only the note can change. */
export async function updateBookmark(id: number, input: UpdateBookmarkInput): Promise<BookmarkDto> {
  const response = await apiClient.patch<BookmarkDto>(`/bookmarks/${id}`, input);
  return response.data;
}

/** `DELETE /bookmarks/:id`. */
export async function deleteBookmark(id: number): Promise<void> {
  await apiClient.delete(`/bookmarks/${id}`);
}
