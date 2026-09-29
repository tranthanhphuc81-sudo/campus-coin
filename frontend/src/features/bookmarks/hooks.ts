/**
 * hooks.ts
 * TanStack Query hooks for `/bookmarks` (docs/spec/05c §5.12): a paginated/filterable list for the
 * `/app/saved` page, an unpaginated "lookup" (one page at the {@link BOOKMARKS_MAX_PER_USER} cap)
 * used by `BookmarkButton` to answer "is this already saved?" in O(1), and the create/update/delete
 * mutations. Every mutation invalidates `['bookmarks']` on settle (mirrors
 * `features/recurring-rules` style broad-invalidate: a low-traffic feature, so a full refetch of
 * whichever bookmark queries are mounted is simpler and cheap).
 * Exports: bookmarksListQueryKey, useBookmarksQuery, useBookmarkLookup, useCreateBookmarkMutation,
 *   useUpdateBookmarkMutation, useDeleteBookmarkMutation
 * Spec: docs/spec/05c §5.12
 */
import { BOOKMARKS_MAX_PER_USER, type BookmarkDto, type BookmarkListResponse, type BookmarkTargetType, type CreateBookmarkInput, type ListBookmarksQuery, type UpdateBookmarkInput } from '@campuscoin/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { ApiError } from '../../lib/apiClient/apiError';
import { createBookmark, deleteBookmark, listBookmarks, updateBookmark } from './api';

/** Query key for a `/bookmarks` list, scoped by its exact filter/page params. */
export function bookmarksListQueryKey(query: Partial<ListBookmarksQuery>) {
  return ['bookmarks', 'list', query] as const;
}

/** Reads a page of the caller's bookmarks for the `/app/saved` page's type filter/search/pagination. */
export function useBookmarksQuery(query: Partial<ListBookmarksQuery>) {
  return useQuery<BookmarkListResponse>({
    queryKey: bookmarksListQueryKey(query),
    queryFn: () => listBookmarks(query),
    placeholderData: (previous) => previous,
  });
}

/**
 * Fetches every bookmark of `type` in one page (the per-user cap is small — {@link BOOKMARKS_MAX_PER_USER})
 * and indexes it by `targetRef`, so `BookmarkButton` can answer "is this already saved?" without a
 * request per row in a list of tips/insights.
 */
export function useBookmarkLookup(type: BookmarkTargetType) {
  const query = useQuery<BookmarkListResponse>({
    queryKey: bookmarksListQueryKey({ type, page: 1, limit: BOOKMARKS_MAX_PER_USER }),
    queryFn: () => listBookmarks({ type, page: 1, limit: BOOKMARKS_MAX_PER_USER }),
  });

  const byTargetRef = useMemo(() => {
    const map = new Map<string, BookmarkDto>();
    for (const bookmark of query.data?.data ?? []) map.set(bookmark.targetRef, bookmark);
    return map;
  }, [query.data]);

  return { byTargetRef, isLoading: query.isLoading };
}

function invalidateBookmarks(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
}

/** `POST /bookmarks`. */
export function useCreateBookmarkMutation() {
  const queryClient = useQueryClient();
  return useMutation<BookmarkDto, ApiError, CreateBookmarkInput>({
    mutationFn: (input) => createBookmark(input),
    onSettled: () => void invalidateBookmarks(queryClient),
  });
}

/** `PATCH /bookmarks/:id` — edits the note. */
export function useUpdateBookmarkMutation() {
  const queryClient = useQueryClient();
  return useMutation<BookmarkDto, ApiError, { id: number; input: UpdateBookmarkInput }>({
    mutationFn: ({ id, input }) => updateBookmark(id, input),
    onSettled: () => void invalidateBookmarks(queryClient),
  });
}

/** `DELETE /bookmarks/:id`. */
export function useDeleteBookmarkMutation() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, number>({
    mutationFn: (id) => deleteBookmark(id),
    onSettled: () => void invalidateBookmarks(queryClient),
  });
}
