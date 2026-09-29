/**
 * notifications.mapper.ts
 * Maps a Prisma `Notification` row to the public {@link NotificationDto}. `id` is serialised as a
 * string (the DB primary key is a `BigInt`, which does not round-trip through `JSON.stringify`).
 * Main exports: toNotificationDto
 * Spec: docs/spec/05c §5.11 (notification DTO)
 */
import type { NotificationDto, NotificationType } from '@campuscoin/shared';
import type { NotificationModel } from '../../generated/prisma/models/Notification.js';

/**
 * Converts a Prisma `Notification` row into the public {@link NotificationDto}.
 * @param notification - Full row, as read from the DB (never partially selected).
 */
export function toNotificationDto(notification: NotificationModel): NotificationDto {
  return {
    id: notification.id.toString(),
    type: notification.type as NotificationType,
    title: notification.title,
    body: notification.body,
    payload: notification.payload,
    readAt: notification.readAt ? notification.readAt.toISOString() : null,
    createdAt: notification.createdAt.toISOString(),
  };
}
