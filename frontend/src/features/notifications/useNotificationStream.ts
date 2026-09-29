/**
 * useNotificationStream.ts
 * Opens a live `GET /notifications/stream` SSE connection (via a fresh one-time ticket from
 * `POST /notifications/stream-ticket`, since `EventSource` cannot send an Authorization header),
 * pushes every event straight into the `/notifications` TanStack Query cache and shows a toast.
 * `EventSource`'s own auto-reconnect can't be used here because each ticket is single-use, so
 * `onerror` closes the dead connection and manually reconnects with a fresh ticket, backing off
 * exponentially so a persistent server outage never hammers `/stream-ticket`. Callers should fall
 * back to `useNotificationsQuery`'s polling (`NOTIFICATION_POLL_INTERVAL_MS`) whenever this hook
 * reports `connected: false` — e.g. `EventSource` unsupported, or a still-reconnecting stream.
 *
 * The connection itself is a module-level, ref-counted singleton (mirrors `AuthContext.tsx`'s
 * `bootstrapSession` dedup pattern for the exact same reason): React 19 `<StrictMode>` mounts
 * every component twice in dev (mount -> cleanup -> remount), and this hook is normally only ever
 * used once (`NotificationBell` in `StudentLayout`) — without ref-counting, that double-mount
 * opened TWO concurrent SSE connections to the same user, so every real server event arrived
 * twice (two duplicate toasts, two duplicate rows in the dropdown for one real notification).
 * Exports: useNotificationStream
 * Spec: docs/spec/05c §5.11 (notifications) · docs/spec/07 §7.3.3
 */
import { API_BASE_PATH, type NotificationListResponse, type NotificationStreamEvent } from '@campuscoin/shared';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useToast } from '../../components/ToastProvider';
import { getStreamTicket } from './api';

/** Initial reconnect delay after a stream drops, in milliseconds. */
const RECONNECT_INITIAL_DELAY_MS = 1000;
/** Cap on the exponential reconnect backoff, in milliseconds. */
const RECONNECT_MAX_DELAY_MS = 30_000;

/** Value returned by {@link useNotificationStream}. */
export interface NotificationStreamState {
  /** True while a live SSE connection is open (callers should enable poll-fallback when false). */
  connected: boolean;
}

// ---- Module-level singleton connection (see header doc for why) -----------------------------
let source: EventSource | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let backoffMs = RECONNECT_INITIAL_DELAY_MS;
let refCount = 0;
/** Set `true` by `teardownConnection`; any in-flight `connect()` bails as soon as it sees this. */
let torn = false;
const messageListeners = new Set<(event: NotificationStreamEvent) => void>();
const connectionListeners = new Set<(connected: boolean) => void>();

function notifyConnectionListeners(connected: boolean): void {
  for (const listener of connectionListeners) listener(connected);
}

function scheduleReconnect(): void {
  if (torn) return;
  reconnectTimer = setTimeout(() => void connect(), backoffMs);
  backoffMs = Math.min(backoffMs * 2, RECONNECT_MAX_DELAY_MS);
}

/** Fetches a fresh ticket and opens the shared `EventSource`; bails if torn down meanwhile. */
async function connect(): Promise<void> {
  if (torn) return;
  try {
    const { ticket } = await getStreamTicket();
    if (torn) return;
    const url = `${API_BASE_PATH}/notifications/stream?ticket=${encodeURIComponent(ticket)}`;
    source = new EventSource(url);
    source.onopen = () => {
      backoffMs = RECONNECT_INITIAL_DELAY_MS;
      notifyConnectionListeners(true);
    };
    source.onmessage = (messageEvent) => {
      try {
        const parsed = JSON.parse(messageEvent.data) as NotificationStreamEvent;
        for (const listener of messageListeners) listener(parsed);
      } catch {
        // Malformed payload — ignore this single event, keep the connection open.
      }
    };
    source.onerror = () => {
      source?.close();
      notifyConnectionListeners(false);
      scheduleReconnect();
    };
  } catch {
    // Ticket fetch failed (network/auth) — retry with backoff.
    notifyConnectionListeners(false);
    scheduleReconnect();
  }
}

/** Starts the shared connection for the first subscriber; a no-op fetch backoff carries over. */
function startConnection(): void {
  torn = false;
  backoffMs = RECONNECT_INITIAL_DELAY_MS;
  void connect();
}

/** Tears down the shared connection once the last subscriber unmounts. */
function teardownConnection(): void {
  torn = true;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = undefined;
  source?.close();
  source = null;
}

/**
 * Applies one stream event to every cached `/notifications` list query, and reports whether the
 * notification was actually new. `budget-alert.handler.ts` (and any other handler) may legitimately
 * call `notify()` more than once for the exact same `(userId, dedupeKey)` pair (e.g. a second
 * over-budget transaction in the same month) — `notify()` itself dedupes the stored row, but this
 * SSE stream still re-broadcasts it, so without this id check the same notification would be
 * prepended into the cache a second time: a duplicate row (and a duplicate/misleading toast) with a
 * repeated React list key. A caller only shows a toast when this returns `true`.
 * @returns `true` if `event.notification.id` was not already present in the cached list.
 */
function applyEventToCache(queryClient: QueryClient, event: NotificationStreamEvent): boolean {
  let isNew = true;
  queryClient.setQueriesData<NotificationListResponse>({ queryKey: ['notifications', 'list'] }, (old) => {
    if (!old) return old;
    if (old.data.some((notification) => notification.id === event.notification.id)) {
      isNew = false;
      return { ...old, unreadCount: event.unreadCount };
    }
    return { ...old, unreadCount: event.unreadCount, data: [event.notification, ...old.data] };
  });
  return isNew;
}

/**
 * Subscribes to the shared, ref-counted SSE connection to `/notifications/stream`: updates the
 * `/notifications` query cache and shows a toast for every event, for as long as this component
 * stays mounted and `enabled` is true.
 */
export function useNotificationStream(enabled = true): NotificationStreamState {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);
  const { showToast } = useToast();
  // Read fresh on every render via a ref (refs are only ever written from an effect, never during
  // render), so the long-lived module-level `onMessage` listener always calls the latest toast fn.
  const showToastRef = useRef(showToast);
  useEffect(() => {
    showToastRef.current = showToast;
  });

  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') return;

    function onMessage(event: NotificationStreamEvent) {
      // Only toast genuinely new notifications — see `applyEventToCache`'s doc for why the same
      // id can legitimately arrive more than once.
      if (applyEventToCache(queryClient, event)) {
        showToastRef.current({ message: event.notification.title });
      }
    }
    function onConnectionChange(next: boolean) {
      setConnected(next);
    }

    messageListeners.add(onMessage);
    connectionListeners.add(onConnectionChange);
    refCount += 1;
    if (refCount === 1) startConnection();

    return () => {
      messageListeners.delete(onMessage);
      connectionListeners.delete(onConnectionChange);
      refCount = Math.max(0, refCount - 1);
      if (refCount === 0) teardownConnection();
    };
  }, [enabled, queryClient]);

  return { connected };
}
