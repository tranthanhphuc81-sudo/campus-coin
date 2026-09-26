import { BookmarkTargetType } from "@prisma/client";

import { prisma } from "../../lib/prisma.js";

export function toPrismaTargetType(value: "tip" | "insight" | "report"): BookmarkTargetType {
  if (value === "tip") {
    return BookmarkTargetType.TIP;
  }

  if (value === "insight") {
    return BookmarkTargetType.INSIGHT;
  }

  return BookmarkTargetType.REPORT;
}

export async function listBookmarksByUser(params: {
  userId: string;
  targetType?: "tip" | "insight" | "report";
  targetRef?: string;
  q?: string;
}) {
  return prisma.bookmark.findMany({
    where: {
      userId: params.userId,
      targetType: params.targetType ? toPrismaTargetType(params.targetType) : undefined,
      targetRef: params.targetRef,
      note: params.q ? { contains: params.q } : undefined,
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
  });
}

export async function createBookmark(params: {
  userId: string;
  targetType: "tip" | "insight" | "report";
  targetRef: string;
  note: string | null;
}) {
  return prisma.bookmark.create({
    data: {
      userId: params.userId,
      targetType: toPrismaTargetType(params.targetType),
      targetRef: params.targetRef,
      note: params.note,
    },
  });
}

export async function updateBookmark(params: {
  userId: string;
  targetType: "tip" | "insight" | "report";
  targetRef: string;
  note: string | null;
}) {
  return prisma.bookmark.update({
    where: {
      userId_targetType_targetRef: {
        userId: params.userId,
        targetType: toPrismaTargetType(params.targetType),
        targetRef: params.targetRef,
      },
    },
    data: {
      note: params.note,
    },
  });
}

export async function deleteBookmark(params: {
  userId: string;
  targetType: "tip" | "insight" | "report";
  targetRef: string;
}) {
  return prisma.bookmark.delete({
    where: {
      userId_targetType_targetRef: {
        userId: params.userId,
        targetType: toPrismaTargetType(params.targetType),
        targetRef: params.targetRef,
      },
    },
  });
}
