/**
 * SavedPage.test.tsx
 * Verifies: the empty state, that the page reads its initial type/search filters from the URL and
 * sends them to `GET /bookmarks`, that clicking a type filter pill requests that type, that the
 * typed search text ends up as the `q` param after debouncing, and that a bookmark whose target is
 * no longer available renders "No longer available" with its Open action disabled.
 */
import type { BookmarkListResponse } from '@campuscoin/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../components/ToastProvider';
import { en } from '../../../i18n/en';
import SavedPage from './SavedPage';

vi.mock('../../../lib/apiClient/apiClient', () => ({ apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));

import { apiClient } from '../../../lib/apiClient/apiClient';

const mockGet = vi.mocked(apiClient.get);

function emptyResponse(): BookmarkListResponse {
  return { data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } };
}

function renderPage(initialEntries: string[] = ['/app/saved']) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={initialEntries}>
          <SavedPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('SavedPage', () => {
  it('renders the empty state when there are no bookmarks', async () => {
    mockGet.mockResolvedValue({ data: emptyResponse() });

    renderPage();

    expect(await screen.findByText(en.saved.empty)).toBeInTheDocument();
  });

  it('reads its initial type/search filters from the URL and sends them to the API', async () => {
    mockGet.mockResolvedValue({ data: emptyResponse() });

    renderPage(['/app/saved?type=insight&q=cafe']);

    await screen.findByText(en.saved.noResults);

    expect(mockGet).toHaveBeenCalledWith(
      '/bookmarks',
      expect.objectContaining({ params: expect.objectContaining({ type: 'insight', q: 'cafe' }) }),
    );
    expect(screen.getByRole('button', { name: en.saved.filterInsights })).toHaveClass('btn-primary');
    expect(screen.getByLabelText(en.saved.searchLabel)).toHaveValue('cafe');
  });

  it('requests the tips-only filter when the Tips pill is clicked', async () => {
    mockGet.mockResolvedValue({ data: emptyResponse() });

    renderPage();
    await screen.findByText(en.saved.empty);

    fireEvent.click(screen.getByRole('button', { name: en.saved.filterTips }));

    await waitFor(() =>
      expect(mockGet).toHaveBeenCalledWith('/bookmarks', expect.objectContaining({ params: expect.objectContaining({ type: 'tip' }) })),
    );
  });

  it('sends the typed search text as the q param after debouncing', async () => {
    mockGet.mockResolvedValue({ data: emptyResponse() });

    renderPage();
    await screen.findByText(en.saved.empty);

    fireEvent.change(screen.getByLabelText(en.saved.searchLabel), { target: { value: 'dining' } });

    await waitFor(
      () => expect(mockGet).toHaveBeenCalledWith('/bookmarks', expect.objectContaining({ params: expect.objectContaining({ q: 'dining' }) })),
      { timeout: 2000 },
    );
  });

  it('shows "No longer available" and disables Open for a stale bookmark', async () => {
    const response: BookmarkListResponse = {
      data: [
        {
          id: 1,
          targetType: 'tip',
          targetRef: '42',
          note: null,
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-09-01T00:00:00.000Z',
          target: { available: false, title: null, excerpt: null },
        },
      ],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    };
    mockGet.mockResolvedValue({ data: response });

    renderPage();

    expect((await screen.findAllByText(en.saved.unavailable)).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: en.saved.open })).toBeDisabled();
  });
});
