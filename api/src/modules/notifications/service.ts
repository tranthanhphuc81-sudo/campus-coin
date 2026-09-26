import type { NotificationType } from "@prisma/client";

import { notFound } from "../../lib/problem.js";
import {
  countUnreadNotifications,
  findNotificationById,
  listNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from "./repository.js";
import type { NotificationDto, NotificationsPage } from "./types.js";

function toWireType(type: NotificationType): NotificationDto["type"] {
  switch (type) {
    case "BUDGET_NEAR":
      return "budget_near";
    case "BUDGET_EXCEEDED":
      return "budget_exceeded";
    case "INSIGHT_READY":
      return "insight_ready";
    case "ANOMALY":
      return "anomaly";
    case "DUPLICATE":
      return "duplicate";
    default:
      return "system";
  }
}

function toDto(item: {
  id: bigint;
  type: NotificationType;
  title: string;
  body: string;
  payload: unknown;
  readAt: Date | null;
  createdAt: Date;
}): NotificationDto {
  return {
    id: item.id.toString(),
    type: toWireType(item.type),
    title: item.title,
    body: item.body,
    payload: item.payload,
    readAt: item.readAt ? item.readAt.toISOString() : null,
    createdAt: item.createdAt.toISOString(),
  };
}

export async function getNotifications(params: {
  userId: string;
  page: number;
  limit: number;
}): Promise<NotificationsPage> {
  const [{ rows, total }, unreadCount] = await Promise.all([
    listNotifications(params),
    countUnreadNotifications(params.userId),
  ]);

  return {
    data: rows.map(toDto),
    meta: {
      page: params.page,
      limit: params.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / params.limit)),
    },
    unreadCount,
  };
}

export async function readNotification(params: {
  userId: string;
  id: bigint;
}): Promise<{ read: boolean }> {
  const changedRows = await markNotificationAsRead(params);
  if (changedRows > 0) {
    return { read: true };
  }

  const existing = await findNotificationById(params);
  if (!existing) {
    throw notFound("Notification was not found.");
  }

  return { read: true };
}

export async function readAllNotifications(userId: string): Promise<{ updated: number }> {
  const updated = await markAllNotificationsAsRead(userId);
  return { updated };
}
