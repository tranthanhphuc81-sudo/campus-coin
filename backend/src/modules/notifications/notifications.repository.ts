/**
 * notifications.repository.ts
 * Prisma access for in-app notifications. Every function that targets a *specific user's* row
 * takes `userId` and scopes by it (CLAUDE.md: never trust client params for ownership) — a
 * notification owned by another user is simply never matched, which is how the service layer
 * turns cross-tenant access into a 404 instead of a 403.
 * Main exports: notificationsRepository, CreateNotificationData, Db
 * Spec: docs/spec/05c §5.11 (notifications) · docs/spec/06 (notifications table)
 */
import type { NotificationType } from '@campuscoin/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import type { NotificationModel } from '../../generated/prisma/models/Notification.js';
import type { AppPrismaClient } from '../../lib/prisma.js';
import { prisma } from '../../lib/prisma.js';

/** Either the shared client or a transaction handle — every method accepts both. */
export type Db = AppPrismaClient | Prisma.TransactionClient;

/** Fields accepted by {@link notificationsRepository.create}. */
export interface CreateNotificationData {
  userId: string;
  type: NotificationType;
  title: string;
  body: string | null;
  /** `undefined` omits the column entirely (stored as SQL NULL) — never pass a bare JS `null` here. */
  payload?: Prisma.InputJsonValue;
  dedupeKey: string;
}

export const notificationsRepository = {
  /**
   * Inserts a notification. Relies on `@@unique([userId, dedupeKey])` to reject a duplicate alert
   * (BR-NO-01) — the caller (`notifications.service.ts`'s `notify`) must catch the resulting
   * `P2002` and treat it as "already sent, no-op".
   */
  create(data: CreateNotificationData, db: Db = prisma): Promise<NotificationModel> {
    return db.notification.create({
      data: {
        userId: data.userId,
        type: data.type,
        title: data.title,
        body: data.body,
        dedupeKey: data.dedupeKey,
        ...(data.payload !== undefined ? { payload: data.payload } : {}),
      },
    });
  },

  /** Paginated list of a user's notifications, newest first. */
  list(userId: string, unreadOnly: boolean, skip: number, take: number, db: Db = prisma): Promise<NotificationModel[]> {
    return db.notification.findMany({
      where: { userId, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
  },

  /** Total count matching the same filter as {@link list} (for pagination `meta`). */
  count(userId: string, unreadOnly: boolean, db: Db = prisma): Promise<number> {
    return db.notification.count({ where: { userId, ...(unreadOnly ? { readAt: null } : {}) } });
  },

  /** Count of unread notifications — always a fresh `count()`, never derived from the current page. */
  countUnread(userId: string, db: Db = prisma): Promise<number> {
    return db.notification.count({ where: { userId, readAt: null } });
  },

  /** A notification owned by `userId` — null for another user's row (gives the 404). */
  findOwned(id: bigint, userId: string, db: Db = prisma): Promise<NotificationModel | null> {
    return db.notification.findFirst({ where: { id, userId } });
  },

  /** Marks one notification read (ownership must already be verified by the caller). */
  markRead(id: bigint, db: Db = prisma): Promise<NotificationModel> {
    return db.notification.update({ where: { id }, data: { readAt: new Date() } });
  },

  /** Marks every unread notification of `userId` as read. */
  markAllRead(userId: string, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
  },

  /**
   * Deletes every notification of `userId` matching one of `dedupeKeys` — TC-20: lets a budget
   * that dropped back under a threshold resend a `budget_near`/`budget_exceeded` alert later (the
   * `@@unique([userId, dedupeKey])` constraint would otherwise block a resend forever). Safe no-op
   * when nothing matches.
   */
  deleteByDedupeKeys(userId: string, dedupeKeys: string[], db: Db = prisma): Promise<Prisma.BatchPayload> {
    if (dedupeKeys.length === 0) return Promise.resolve({ count: 0 });
    return db.notification.deleteMany({ where: { userId, dedupeKey: { in: dedupeKeys } } });
  },
};
