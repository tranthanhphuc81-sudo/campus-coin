import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

import api from "@/lib/api";

const bookmarkTargetTypeSchema = z.enum(["tip", "insight", "report"]);

const bookmarkItemSchema = z.object({
  id: z.string(),
  targetType: bookmarkTargetTypeSchema,
  targetRef: z.string(),
  note: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const listBookmarksResponseSchema = z.object({
  items: z.array(bookmarkItemSchema),
});

const wrappedListBookmarksSchema = z.object({
  data: listBookmarksResponseSchema,
});

const bookmarkMutationInputSchema = z.object({
  targetType: bookmarkTargetTypeSchema,
  targetRef: z.string().trim().min(1).max(255),
  note: z.string().trim().max(500).nullable().optional(),
});

const deleteBookmarkInputSchema = z.object({
  targetType: bookmarkTargetTypeSchema,
  targetRef: z.string().trim().min(1).max(255),
});

export type BookmarkTargetType = z.infer<typeof bookmarkTargetTypeSchema>;
export type BookmarkItem = z.infer<typeof bookmarkItemSchema>;
export type BookmarkMutationInput = z.infer<typeof bookmarkMutationInputSchema>;
export type DeleteBookmarkInput = z.infer<typeof deleteBookmarkInputSchema>;

export function bookmarksQueryKey(filters?: {
  targetType?: BookmarkTargetType;
  targetRef?: string;
  q?: string;
}) {
  return ["bookmarks", filters ?? {}] as const;
}

export function useBookmarks(filters?: {
  targetType?: BookmarkTargetType;
  targetRef?: string;
  q?: string;
}) {
  return useQuery({
    queryKey: bookmarksQueryKey(filters),
    queryFn: async () => {
      const response = await api.get("/bookmarks", {
        params: {
          targetType: filters?.targetType,
          targetRef: filters?.targetRef,
          q: filters?.q,
        },
      });

      return wrappedListBookmarksSchema.parse(response.data).data;
    },
  });
}

export function useCreateBookmark() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: BookmarkMutationInput) => {
      const parsed = bookmarkMutationInputSchema.parse(payload);
      const response = await api.post("/bookmarks", parsed);
      return response.data as { data: BookmarkItem };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
    },
  });
}

export function useUpdateBookmark() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: BookmarkMutationInput) => {
      const parsed = bookmarkMutationInputSchema.parse(payload);
      const response = await api.patch("/bookmarks", {
        ...parsed,
        note: parsed.note ?? null,
      });
      return response.data as { data: BookmarkItem };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
    },
  });
}

export function useDeleteBookmark() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: DeleteBookmarkInput) => {
      const parsed = deleteBookmarkInputSchema.parse(payload);
      const response = await api.delete("/bookmarks", { data: parsed });
      return response.data as { data: { success: true } };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
    },
  });
}
