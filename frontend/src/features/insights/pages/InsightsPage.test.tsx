/**
 * InsightsPage.test.tsx
 * Verifies: the empty state when there's no insight history yet, a completed insight's
 * summary/tip/chips rendering (growth chip carries a signed `%`, never colour alone), and the
 * Regenerate button being disabled once `regenerateRemaining` reaches 0.
 * Spec: docs/spec/05b §5.9
 */
import type { InsightDto, InsightListResponse } from '@campuscoin/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../components/ToastProvider';
import { en } from '../../../i18n/en';
import InsightsPage from './InsightsPage';

vi.mock('../../../lib/apiClient/apiClient', () => ({ apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));

import { apiClient } from '../../../lib/apiClient/apiClient';

const mockGet = vi.mocked(apiClient.get);

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter>
          <InsightsPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const COMPLETED_INSIGHT: InsightDto = {
  id: 1,
  month: '2026-08-01',
  summaryText: 'You spent more on Dining this month than usual.',
  tipText: 'Try capping weekly dining spend.',
  flaggedPatterns: [
    { kind: 'growth', categoryId: 10, categoryName: 'Dining', amount: '150.00', avg3: '100.00', growthPct: 50, weeklyCap: '25.00' },
  ],
  savingsRatePct: 12,
  generator: 'llm',
  status: 'completed',
  regenerateCount: 3,
  regenerateRemaining: 0,
  generatedAt: '2026-08-31T00:00:00.000Z',
  createdAt: '2026-08-31T00:00:00.000Z',
};

describe('InsightsPage', () => {
  it('renders the empty state when there is no insight history', async () => {
    mockGet.mockResolvedValue({ data: { data: [], page: 1, limit: 12, total: 0 } as InsightListResponse });

    renderPage();

    expect(await screen.findByText(en.insights.empty)).toBeInTheDocument();
  });

  it("renders a completed insight's summary, tip and a growth chip with a signed percent", async () => {
    mockGet.mockResolvedValue({
      data: { data: [COMPLETED_INSIGHT], page: 1, limit: 12, total: 1 } as InsightListResponse,
    });

    renderPage();

    expect(await screen.findByText(COMPLETED_INSIGHT.summaryText!)).toBeInTheDocument();
    expect(screen.getByText(COMPLETED_INSIGHT.tipText!)).toBeInTheDocument();
    expect(screen.getByText(en.insights.patterns.growth('Dining', 50))).toBeInTheDocument();
    expect(screen.getByText(en.insights.generatorLlm)).toBeInTheDocument();
  });

  it('disables the Regenerate button once regenerateRemaining reaches 0', async () => {
    mockGet.mockResolvedValue({
      data: { data: [COMPLETED_INSIGHT], page: 1, limit: 12, total: 1 } as InsightListResponse,
    });

    renderPage();

    const button = await screen.findByRole('button', { name: new RegExp(en.insights.regenerate) });
    expect(button).toBeDisabled();
  });
});
