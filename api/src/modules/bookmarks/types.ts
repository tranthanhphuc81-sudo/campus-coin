export type BookmarkTargetType = "tip" | "insight" | "report";

export type BookmarkItem = {
  id: string;
  targetType: BookmarkTargetType;
  targetRef: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ListBookmarksInput = {
  targetType?: BookmarkTargetType;
  targetRef?: string;
  q?: string;
};

export type ListBookmarksResponse = {
  items: BookmarkItem[];
};

export type UpsertBookmarkInput = {
  targetType: BookmarkTargetType;
  targetRef: string;
  note?: string | null;
};

export type DeleteBookmarkInput = {
  targetType: BookmarkTargetType;
  targetRef: string;
};
