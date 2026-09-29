/**
 * NotificationBell.tsx
 * Navbar bell icon + unread-count badge, opening a dropdown of recent notifications. Opens a live
 * SSE stream (`useNotificationStream`) and falls back to polling (`useNotificationsQuery`'s
 * `refetchInterval`) while no stream is connected. An anomaly/duplicate notification (P14) also
 * navigates to that transaction's drawer on click, and — the first time each such notification is
 * seen, whether it arrived via the live stream or a poll refetch — invalidates the transactions
 * queries so the new flag badge/banner shows up without a manual refresh.
 * Exports: NotificationBell
 * Spec: docs/spec/05c §5.11 (notifications) · docs/spec/05c §5.14 (anomaly/duplicate)
 */
import { NotificationType, type NotificationDto } from '@campuscoin/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';
import Dropdown from 'react-bootstrap/Dropdown';
import { useNavigate } from 'react-router';
import { EmptyState } from '../../../components/EmptyState';
import { en } from '../../../i18n/en';
import { formatDateTime } from '../../../lib/dates';
import { useMarkAllReadMutation, useMarkReadMutation, useNotificationsQuery } from '../hooks';
import { useNotificationStream } from '../useNotificationStream';

/** Reads `payload.transactionId` out of a notification's `unknown` payload, if present. */
function transactionIdFromPayload(payload: unknown): string | null {
  if (payload && typeof payload === 'object' && 'transactionId' in payload) {
    const value = (payload as { transactionId?: unknown }).transactionId;
    if (typeof value === 'string') return value;
  }
  return null;
}

/** True for the two notification types that carry a `transactionId` payload (P14). */
function isFlagNotification(type: NotificationDto['type']): boolean {
  return type === NotificationType.ANOMALY || type === NotificationType.DUPLICATE;
}

/**
 * One notification row in the dropdown. Unread rows are bold (a non-colour cue) AND carry an
 * explicit "Unread" text badge, so status is never conveyed by colour/dot alone (spec §8.5).
 * Anomaly/duplicate notifications also navigate to the flagged transaction's drawer on click.
 */
function NotificationItem({
  notification,
  onRead,
  onNavigateToTransaction,
}: {
  notification: NotificationDto;
  onRead: (id: string) => void;
  onNavigateToTransaction: (transactionId: string) => void;
}) {
  const isUnread = notification.readAt === null;
  const transactionId = isFlagNotification(notification.type) ? transactionIdFromPayload(notification.payload) : null;

  function handleClick() {
    if (isUnread) onRead(notification.id);
    if (transactionId) onNavigateToTransaction(transactionId);
  }

  return (
    <button
      type="button"
      className={`dropdown-item d-flex align-items-start gap-2 text-wrap ${isUnread ? 'fw-semibold' : ''}`}
      onClick={handleClick}
    >
      <span className="flex-grow-1">
        <span className="d-flex align-items-center gap-2">
          <span>{notification.title}</span>
          {isUnread ? <span className="badge text-bg-primary">{en.notifications.unreadBadge}</span> : null}
        </span>
        {notification.body ? <span className="d-block small text-body-secondary">{notification.body}</span> : null}
        <span className="d-block small text-body-secondary">{formatDateTime(notification.createdAt)}</span>
      </span>
    </button>
  );
}

/** Navbar notification bell: unread badge + dropdown list, backed by SSE with a polling fallback. */
export function NotificationBell() {
  const { connected } = useNotificationStream();
  const notificationsQuery = useNotificationsQuery({ limit: 10 }, { pollingEnabled: !connected });
  const markReadMutation = useMarkReadMutation();
  const markAllReadMutation = useMarkAllReadMutation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const unreadCount = notificationsQuery.data?.unreadCount ?? 0;
  const notificationsData = notificationsQuery.data?.data;
  const notifications = useMemo(() => notificationsData ?? [], [notificationsData]);

  // Every anomaly/duplicate notification id already reacted to (avoids re-invalidating on every
  // unrelated re-render/poll of the same, already-seen notification).
  const handledFlagIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    let sawNewFlag = false;
    for (const notification of notifications) {
      if (!isFlagNotification(notification.type) || handledFlagIds.current.has(notification.id)) continue;
      handledFlagIds.current.add(notification.id);
      sawNewFlag = true;
    }
    if (sawNewFlag) void queryClient.invalidateQueries({ queryKey: ['transactions'] });
  }, [notifications, queryClient]);

  return (
    <Dropdown align="end">
      <Dropdown.Toggle
        as="button"
        type="button"
        className="btn btn-outline-secondary btn-sm position-relative"
        aria-label={`${en.notifications.bellLabel}${unreadCount > 0 ? ` — ${en.notifications.unreadAria(unreadCount)}` : ''}`}
        id="notification-bell-toggle"
      >
        <i className="bi bi-bell" aria-hidden="true" />
        {unreadCount > 0 ? (
          <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        ) : null}
      </Dropdown.Toggle>
      <Dropdown.Menu style={{ minWidth: '20rem', maxHeight: '24rem', overflowY: 'auto' }}>
        <div className="d-flex justify-content-between align-items-center px-3 py-1">
          <span className="fw-semibold">{en.notifications.bellLabel}</span>
          {unreadCount > 0 ? (
            <button type="button" className="btn btn-sm btn-link p-0" onClick={() => markAllReadMutation.mutate()}>
              {en.notifications.markAllRead}
            </button>
          ) : null}
        </div>
        <Dropdown.Divider />
        {notificationsQuery.isError ? (
          <div className="px-3 py-2 text-body-secondary small">{en.notifications.error}</div>
        ) : notifications.length === 0 ? (
          <div className="px-2">
            <EmptyState icon="bi-bell-slash" message={en.notifications.empty} />
          </div>
        ) : (
          notifications.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              onRead={(id) => markReadMutation.mutate(id)}
              onNavigateToTransaction={(transactionId) => navigate(`/app/transactions?open=${transactionId}`)}
            />
          ))
        )}
      </Dropdown.Menu>
    </Dropdown>
  );
}
