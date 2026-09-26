import { Prisma } from "@prisma/client";

import { conflict, notFound } from "../../lib/problem.js";
import {
  createBookmark,
  deleteBookmark,
  listBookmarksByUser,
  updateBookmark,
} from "./repository.js";
import type {
  BookmarkItem,
  DeleteBookmarkInput,
  ListBookmarksInput,
  ListBookmarksResponse,
  UpsertBookmarkInput,
} from "./types.js";

function toWireTargetType(value: "TIP" | "INSIGHT" | "REPORT"): BookmarkItem["targetType"] {
  if (value === "TIP") {
    return "tip";
  }

  if (value === "INSIGHT") {
    return "insight";
  }

  return "report";
}

export async function listBookmarks(
  userId: string,
  query: ListBookmarksInput,
): Promise<ListBookmarksResponse> {
  const rows = await listBookmarksByUser({
    userId,
    targetType: query.targetType,
    targetRef: query.targetRef,
    q: query.q,
  });

  return {
    items: rows.map((row) => ({
      id: row.id.toString(),
      targetType: toWireTargetType(row.targetType),
      targetRef: row.targetRef,
      note: row.note,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
  };
}

export async function createBookmarkForUser(userId: string, input: UpsertBookmarkInput) {
  try {
    const row = await createBookmark({
      userId,
      targetType: input.targetType,
      targetRef: input.targetRef,
      note: input.note ?? null,
    });

    return {
      id: row.id.toString(),
      targetType: toWireTargetType(row.targetType),
      targetRef: row.targetRef,
      note: row.note,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    } satisfies BookmarkItem;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw conflict("This item is already bookmarked.");
    }

    throw error;
  }
}

export async function updateBookmarkForUser(userId: string, input: UpsertBookmarkInput) {
  try {
    const row = await updateBookmark({
      userId,
      targetType: input.targetType,
      targetRef: input.targetRef,
      note: input.note ?? null,
    });

    return {
      id: row.id.toString(),
      targetType: toWireTargetType(row.targetType),
      targetRef: row.targetRef,
      note: row.note,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    } satisfies BookmarkItem;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      throw notFound("Bookmark was not found.");
    }

    throw error;
  }
}

export async function deleteBookmarkForUser(userId: string, input: DeleteBookmarkInput) {
  try {
    await deleteBookmark({
      userId,
      targetType: input.targetType,
      targetRef: input.targetRef,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      throw notFound("Bookmark was not found.");
    }

    throw error;
  }
}
