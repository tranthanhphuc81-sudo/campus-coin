/**
 * notifications.service.ts
 * Business logic for in-app notifications: `notify` (the shared, cross-module entry point every
 * domain-event handler uses to raise an alert), paginated list/mark-read, and the one-time SSE
 * stream ticket (`GET /notifications/stream` cannot use the normal Bearer middleware, since
 * EventSource cannot set an Authorization header). Every function takes `userId` from the
 * verified token; a notification not owned by the caller is a 404, never a 403 (CLAUDE.md
 * cross-tenant invariant).
 * Main exports: notify, clearDedupeKeys, list, markRead, markAllRead, createStreamTicket,
 *   consumeStreamTicket, channelFor
 * Spec: docs/spec/05c §5.11 (notifications) · docs/spec/07 §7.3.3 · Rules: BR-NO-01
 */
import { randomBytes } from 'node:crypto';
import {
  NOTIFICATION_STREAM_TICKET_TTL_SEC,
  type ListNotificationsQueryInput,
  type NotificationDto,
  type NotificationListResponse,
  type NotificationStreamEvent,
  type NotificationStreamTicketDto,
  type NotificationType,
} from '@campuscoin/shared';
import { Prisma } from '../../generated/prisma/client.js';
import { logger } from '../../lib/logger.js';
import { notFound } from '../../lib/problem.js';
import { parsePagination } from '../../lib/pagination.js';
import { redis } from '../../lib/redis.js';
import { notificationsRepository } from './notifications.repository.js';
import { toNotificationDto } from './notifications.mapper.js';

const STREAM_TICKET_PREFIX = 'stream-ticket:';

/** Input to {@link notify}. */
export interface NotifyInput {
  type: NotificationType;
  title: string;
  body?: string | null;
  payload?: unknown;
  /** Unique per (userId, alert instance) — e.g. `budget:<id>:<month>:near` (BR-NO-01). */
  dedupeKey: string;
}

/** Redis pub/sub channel a user's open SSE connection(s) listen on. */
export function channelFor(userId: string): string {
  return `notify:${userId}`;
}

/**
 * Publishes a newly-created notification over Redis pub/sub so any open `GET /notifications/stream`
 * connection for `userId` picks it up immediately. Never throws — a Redis outage must not break
 * the caller that raised the notification (graceful degradation, same style as `lib/cache.ts`).
 */
async function publish(userId: string, notification: NotificationDto): Promise<void> {
  try {
    const unreadCount = await notificationsRepository.countUnread(userId);
    const event: NotificationStreamEvent = { notification, unreadCount };
    await redis.publish(channelFor(userId), JSON.stringify(event));
  } catch (err) {
    logger.warn({ err, userId }, '[notifications] publish failed, SSE clients will miss this event');
  }
}

/**
 * BR-NO-01: raises a notification, but only once per `(userId, dedupeKey)` — a repeat call with
 * the same `dedupeKey` (e.g. the budget-alert handler re-evaluating the same crossed threshold) is
 * a no-op, not an error. On a genuine insert, publishes the notification over Redis pub/sub.
 * @returns The created notification, or `null` when `dedupeKey` had already been used (no-op).
 */
export async function notify(userId: string, input: NotifyInput): Promise<NotificationDto | null> {
  try {
    const row = await notificationsRepository.create({
      userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      ...(input.payload !== undefined ? { payload: input.payload as Prisma.InputJsonValue } : {}),
      dedupeKey: input.dedupeKey,
    });
    const dto = toNotificationDto(row);
    await publish(userId, dto);
    return dto;
  } catch (err) {
    // BR-NO-01: a UNIQUE(userId, dedupeKey) violation means this alert was already sent — no-op.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return null;
    throw err;
  }
}

/**
 * Deletes any previously-sent notifications matching `dedupeKeys` (TC-20: lets a budget that
 * dropped back under a threshold resend later). Safe no-op when nothing matches.
 */
export async function clearDedupeKeys(userId: string, dedupeKeys: string[]): Promise<void> {
  await notificationsRepository.deleteByDedupeKeys(userId, dedupeKeys);
}

/** Paginated list of the caller's notifications, newest first, plus a fresh unread count. */
export async function list(userId: string, query: ListNotificationsQueryInput): Promise<NotificationListResponse> {
  const { page, limit, skip, take } = parsePagination(query);
  const [rows, total, unreadCount] = await Promise.all([
    notificationsRepository.list(userId, query.unreadOnly, skip, take),
    notificationsRepository.count(userId, query.unreadOnly),
    notificationsRepository.countUnread(userId),
  ]);
  return { data: rows.map(toNotificationDto), unreadCount, page, limit, total };
}

/**
 * Marks one of the caller's own notifications read.
 * @throws {AppError} 404 when not found/not owned.
 */
export async function markRead(userId: string, id: bigint): Promise<NotificationDto> {
  const current = await notificationsRepository.findOwned(id, userId);
  if (!current) throw notFound('Notification not found.');
  const updated = await notificationsRepository.markRead(id);
  return toNotificationDto(updated);
}

/** Marks every unread notification of the caller as read. */
export async function markAllRead(userId: string): Promise<void> {
  await notificationsRepository.markAllRead(userId);
}

/**
 * Issues a one-time, short-lived ticket the client exchanges for an SSE connection at
 * `GET /notifications/stream?ticket=` (EventSource cannot send an Authorization header, so this
 * ticket carries the auth instead — obtained via the normal Bearer-authenticated
 * `POST /notifications/stream-ticket`).
 */
export async function createStreamTicket(userId: string): Promise<NotificationStreamTicketDto> {
  const ticket = randomBytes(24).toString('base64url');
  await redis.set(`${STREAM_TICKET_PREFIX}${ticket}`, userId, 'EX', NOTIFICATION_STREAM_TICKET_TTL_SEC, 'NX');
  return { ticket, expiresInSec: NOTIFICATION_STREAM_TICKET_TTL_SEC };
}

/**
 * Atomically reads and deletes a stream ticket (single-use). A plain GET+DEL would have a small
 * TOCTOU race between two simultaneous requests for the same ticket, but that race is not
 * security-relevant here (the ticket is short-lived and single-use either way) — `GETDEL` avoids
 * it anyway since it is available on the ioredis version this project pins.
 * @returns The `userId` the ticket was issued to, or `null` when it is missing/expired/already used.
 */
export async function consumeStreamTicket(ticket: string): Promise<string | null> {
  const userId = (await redis.call('GETDEL', `${STREAM_TICKET_PREFIX}${ticket}`)) as string | null;
  return userId;
}
