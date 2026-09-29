/**
 * useNotificationStream.test.tsx
 * Verifies: a successful SSE message updates the `/notifications` query cache and shows a toast;
 * a dropped connection (`onerror`) closes the dead `EventSource` and reconnects with a fresh
 * ticket after a backoff delay; when `EventSource` is unsupported the hook reports `connected:
 * false` and never attempts a connection (the poll-fallback engages instead); and — the bug this
 * hook's module-level ref-counted singleton exists to prevent — React's `<StrictMode>` double
 * mount never opens two concurrent connections nor double-delivers one event.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const showToastMock = vi.fn();
vi.mock('../../components/ToastProvider', () => ({ useToast: () => ({ showToast: showToastMock }) }));

const getStreamTicketMock = vi.fn();
vi.mock('./api', () => ({ getStreamTicket: (...args: unknown[]) => getStreamTicketMock(...args) }));

import { useNotificationStream } from './useNotificationStream';

/** Minimal controllable `EventSource` stand-in; tests drive `onopen`/`onmessage`/`onerror` directly. */
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  close() {
    this.closed = true;
  }
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useNotificationStream', () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    getStreamTicketMock.mockReset().mockResolvedValue({ ticket: 'ticket-1', expiresInSec: 30 });
    showToastMock.mockReset();
    vi.stubGlobal('EventSource', FakeEventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('applies an incoming event to the cache and shows a toast', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(['notifications', 'list', {}], { data: [], unreadCount: 0, page: 1, limit: 10, total: 0 });

    renderHook(() => useNotificationStream(), {
      wrapper: ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
    });

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const source = FakeEventSource.instances[0]!;
    expect(source.url).toContain('ticket=ticket-1');

    source.onmessage?.({
      data: JSON.stringify({
        notification: { id: '1', type: 'budget_near', title: 'Near budget limit', body: null, payload: null, readAt: null, createdAt: new Date().toISOString() },
        unreadCount: 1,
      }),
    });

    expect(showToastMock).toHaveBeenCalledWith({ message: 'Near budget limit' });
    const cached = queryClient.getQueryData<{ unreadCount: number; data: unknown[] }>(['notifications', 'list', {}]);
    expect(cached?.unreadCount).toBe(1);
    expect(cached?.data).toHaveLength(1);
  });

  it('reconnects with a fresh ticket after the connection drops', async () => {
    const { result } = renderHook(() => useNotificationStream(), { wrapper });

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const first = FakeEventSource.instances[0]!;
    first.onopen?.();
    await waitFor(() => expect(result.current.connected).toBe(true));

    getStreamTicketMock.mockResolvedValue({ ticket: 'ticket-2', expiresInSec: 30 });
    first.onerror?.();

    expect(first.closed).toBe(true);
    await waitFor(() => expect(result.current.connected).toBe(false));

    // Real 1s reconnect backoff — waitFor polls with real timers until the fresh connection opens.
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(2), { timeout: 3000 });
    expect(FakeEventSource.instances[1]!.url).toContain('ticket=ticket-2');
  }, 10000);

  it('never opens a connection when EventSource is unsupported (poll-fallback path)', () => {
    vi.stubGlobal('EventSource', undefined);
    const { result } = renderHook(() => useNotificationStream(), { wrapper });

    expect(result.current.connected).toBe(false);
    expect(getStreamTicketMock).not.toHaveBeenCalled();
  });

  it('never opens two concurrent connections or double-delivers one event under StrictMode double-mount', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(['notifications', 'list', {}], { data: [], unreadCount: 0, page: 1, limit: 10, total: 0 });

    renderHook(() => useNotificationStream(), {
      wrapper: ({ children }) => (
        <StrictMode>
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        </StrictMode>
      ),
    });

    // StrictMode's mount -> cleanup -> remount should settle on exactly one live connection, not two.
    await waitFor(() => expect(FakeEventSource.instances.filter((s) => !s.closed)).toHaveLength(1));
    const live = FakeEventSource.instances.find((s) => !s.closed)!;

    live.onmessage?.({
      data: JSON.stringify({
        notification: { id: '1', type: 'budget_near', title: 'Near budget limit', body: null, payload: null, readAt: null, createdAt: new Date().toISOString() },
        unreadCount: 1,
      }),
    });

    expect(showToastMock).toHaveBeenCalledTimes(1);
    const cached = queryClient.getQueryData<{ unreadCount: number; data: unknown[] }>(['notifications', 'list', {}]);
    expect(cached?.data).toHaveLength(1);
  });
});
