/**
 * notification.ts
 * Zod schema and DTO types for in-app notifications (budget alerts, insight-ready, anomaly,
 * duplicate, system) and the one-time SSE ticket used to open `GET /notifications/stream`
 * (EventSource cannot send an Authorization header, so the ticket carries the auth instead).
 * Main exports: listNotificationsQuerySchema + inferred type, NotificationDto,
 *   NotificationListResponse, NotificationStreamTicketDto
 * Spec: docs/spec/05c §5.11 · docs/spec/07 §7.3.3
 */
import { z } from 'zod';
import { PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX } from '../constants.js';
import type { NotificationType } from '../enums.js';

/** Query of `GET /notifications`. */
export const listNotificationsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(PAGE_SIZE_DEFAULT),
    unreadOnly: z
      .enum(['true', 'false'])
      .optional()
      .default('false')
      .transform((v) => v === 'true'),
  })
  .strict();
/** Inferred input type of {@link listNotificationsQuerySchema}. */
export type ListNotificationsQueryInput = z.infer<typeof listNotificationsQuerySchema>;

/** Shape of a notification as returned by the API. `id` is a string (DB `BigInt` PK). */
export interface NotificationDto {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  payload: unknown;
  readAt: string | null;
  createdAt: string;
}

/** Response body of `GET /notifications`. */
export interface NotificationListResponse {
  data: NotificationDto[];
  unreadCount: number;
  page: number;
  limit: number;
  total: number;
}

/** Response body of `POST /notifications/stream-ticket`. */
export interface NotificationStreamTicketDto {
  ticket: string;
  expiresInSec: number;
}

/** One event pushed down the `GET /notifications/stream` SSE channel. */
export interface NotificationStreamEvent {
  notification: NotificationDto;
  unreadCount: number;
}
