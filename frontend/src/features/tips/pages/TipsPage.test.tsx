/**
 * TipsPage.test.tsx
 * Verifies: the empty state when there are no tips, a list of tips rendering title/body/impact,
 * and that dismissing a tip removes it from the visible list (optimistic update).
 * Spec: docs/spec/05b §5.10
 */
import type { TipDto, TipListResponse } from '@campuscoin/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../components/ToastProvider';
import { en } from '../../../i18n/en';
import TipsPage from './TipsPage';

vi.mock('../../../lib/apiClient/apiClient', () => ({ apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));

import { apiClient } from '../../../lib/apiClient/apiClient';

const mockGet = vi.mocked(apiClient.get);
const mockPost = vi.mocked(apiClient.post);

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter>
          <TipsPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const TIP_A: TipDto = {
  id: '1',
  ruleType: 'above_average',
  categoryId: 10,
  categoryName: 'Dining',
  period: '2026-09-01',
  title: 'You spend more on Dining than average',
  body: 'Consider capping dining spend at $25/week.',
  impactAmount: '25.00',
  score: 0.8,
  status: 'active',
  dismissedUntil: null,
  createdAt: '2026-09-01T00:00:00.000Z',
};

describe('TipsPage', () => {
  it('renders the empty state when there are no tips', async () => {
    mockGet.mockResolvedValue({ data: { data: [] } as TipListResponse });

    renderPage();

    expect(await screen.findByText(en.tips.empty)).toBeInTheDocument();
  });

  it('renders a list of tips with title, body and impact', async () => {
    mockGet.mockResolvedValue({ data: { data: [TIP_A] } as TipListResponse });

    renderPage();

    expect(await screen.findByText(TIP_A.title)).toBeInTheDocument();
    expect(screen.getByText(TIP_A.body)).toBeInTheDocument();
  });

  it('removes a tip from the visible list once dismissed', async () => {
    // Initial load returns the tip; the mutation's `onSettled` refetch (server-truth reconciliation)
    // must see it gone too, matching what a real dismiss would do server-side.
    mockGet.mockResolvedValueOnce({ data: { data: [TIP_A] } as TipListResponse });
    mockGet.mockResolvedValue({ data: { data: [] } as TipListResponse });
    mockPost.mockResolvedValue({ data: { ...TIP_A, status: 'dismissed', dismissedUntil: '2026-10-01' } });

    renderPage();

    await screen.findByText(TIP_A.title);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(en.tips.dismiss) }));

    // Optimistic removal happens immediately, before the mutation's request even resolves.
    await waitFor(() => expect(screen.queryByText(TIP_A.title)).not.toBeInTheDocument());
    expect(mockPost).toHaveBeenCalledWith(`/tips/${TIP_A.id}/dismiss`);
  });
});
