import { type Notification } from "@prisma/client";

import { prisma } from "../../lib/prisma.js";

export async function listNotifications(params: {
  userId: string;
  page: number;
  limit: number;
}): Promise<{ rows: Notification[]; total: number }> {
  const skip = (params.page - 1) * params.limit;

  const [rows, total] = await Promise.all([
    prisma.notification.findMany({
      where: {
        userId: params.userId,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take: params.limit,
    }),
    prisma.notification.count({
      where: {
        userId: params.userId,
      },
    }),
  ]);

  return {
    rows,
    total,
  };
}

export async function countUnreadNotifications(userId: string): Promise<number> {
  return prisma.notification.count({
    where: {
      userId,
      readAt: null,
    },
  });
}

export async function markNotificationAsRead(params: {
  userId: string;
  id: bigint;
}): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: {
      id: params.id,
      userId: params.userId,
      readAt: null,
    },
    data: {
      readAt: new Date(),
    },
  });

  return result.count;
}

export async function findNotificationById(params: { userId: string; id: bigint }) {
  return prisma.notification.findFirst({
    where: {
      id: params.id,
      userId: params.userId,
    },
  });
}

export async function markAllNotificationsAsRead(userId: string): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: {
      userId,
      readAt: null,
    },
    data: {
      readAt: new Date(),
    },
  });

  return result.count;
}
