/**
 * api.ts
 * Thin wrappers around `/notifications` (paginated list + unread count, mark-one/mark-all read,
 * SSE connection ticket). `GET /notifications/stream` itself is opened as a raw `EventSource` by
 * `useNotificationStream`, not through `apiClient` (EventSource cannot send an Authorization
 * header — see `getStreamTicket`).
 * Exports: listNotifications, markNotificationRead, markAllNotificationsRead, getStreamTicket
 * Spec: docs/spec/05c §5.11 · docs/spec/07 §7.3.3
 */
import type { ListNotificationsQueryInput, NotificationDto, NotificationListResponse, NotificationStreamTicketDto } from '@campuscoin/shared';
import { apiClient } from '../../lib/apiClient/apiClient';

/** `GET /notifications` — a page of notifications plus the caller's total unread count. */
export async function listNotifications(query: Partial<ListNotificationsQueryInput> = {}): Promise<NotificationListResponse> {
  const response = await apiClient.get<NotificationListResponse>('/notifications', { params: query });
  return response.data;
}

/** `POST /notifications/:id/read` — marks a single notification read. */
export async function markNotificationRead(id: string): Promise<NotificationDto> {
  const response = await apiClient.post<NotificationDto>(`/notifications/${id}/read`);
  return response.data;
}

/** `POST /notifications/read-all` — marks every notification read. */
export async function markAllNotificationsRead(): Promise<void> {
  await apiClient.post('/notifications/read-all');
}

/** `POST /notifications/stream-ticket` — a one-time ticket to open `GET /notifications/stream`. */
export async function getStreamTicket(): Promise<NotificationStreamTicketDto> {
  const response = await apiClient.post<NotificationStreamTicketDto>('/notifications/stream-ticket');
  return response.data;
}
