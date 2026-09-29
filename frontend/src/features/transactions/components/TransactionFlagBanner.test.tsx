/**
 * TransactionFlagBanner.test.tsx
 * Verifies: nothing renders when neither flag is set; a possible-duplicate transaction shows
 * "Keep"/"Delete duplicate"; an anomaly shows "Keep"/"Delete"; each button posts the exact
 * `{flag, action}` the `keep|delete` wire contract (P14) expects; and a successful "Delete" calls
 * `onDeleted`.
 */
import type { TransactionDto } from '@campuscoin/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../components/ToastProvider';
import { en } from '../../../i18n/en';
import { TransactionFlagBanner } from './TransactionFlagBanner';

vi.mock('../../../lib/apiClient/apiClient', () => ({ apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));

import { apiClient } from '../../../lib/apiClient/apiClient';

const mockPost = vi.mocked(apiClient.post);

const BASE_TRANSACTION: TransactionDto = {
  id: 'txn-1',
  type: 'expense',
  categoryId: 1,
  category: { id: 1, name: 'Dining', type: 'expense', icon: null, color: null },
  amount: '250.00',
  currency: 'USD',
  description: 'Big dinner',
  txnDate: '2026-09-20',
  source: 'manual',
  recurringRuleId: null,
  recurringPeriod: null,
  categorySource: 'user',
  aiSuggestedCategoryId: null,
  aiConfidence: null,
  isAnomaly: false,
  isPossibleDuplicate: false,
  version: 1,
  deletedAt: null,
  createdAt: '2026-09-20T00:00:00.000Z',
  updatedAt: '2026-09-20T00:00:00.000Z',
};

function renderBanner(transaction: TransactionDto, onDeleted = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <TransactionFlagBanner transaction={transaction} onDeleted={onDeleted} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { ...utils, onDeleted };
}

describe('TransactionFlagBanner', () => {
  it('renders nothing when neither flag is set', () => {
    renderBanner(BASE_TRANSACTION);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(en.transactions.flags.keep)).not.toBeInTheDocument();
  });

  it('sends {flag:"duplicate", action:"keep"} when Keep is clicked on a duplicate flag', async () => {
    mockPost.mockResolvedValue({ data: { ...BASE_TRANSACTION, isPossibleDuplicate: false } });
    renderBanner({ ...BASE_TRANSACTION, isPossibleDuplicate: true });

    fireEvent.click(screen.getByRole('button', { name: en.transactions.flags.keep }));

    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/transactions/txn-1/resolve-flag', { flag: 'duplicate', action: 'keep' }));
  });

  it('sends {flag:"duplicate", action:"delete"} and calls onDeleted when "Delete duplicate" is clicked', async () => {
    mockPost.mockResolvedValue({ data: { ...BASE_TRANSACTION, isPossibleDuplicate: true, deletedAt: '2026-09-21T00:00:00.000Z' } });
    const { onDeleted } = renderBanner({ ...BASE_TRANSACTION, isPossibleDuplicate: true });

    fireEvent.click(screen.getByRole('button', { name: en.transactions.flags.deleteDuplicate }));

    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/transactions/txn-1/resolve-flag', { flag: 'duplicate', action: 'delete' }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
  });

  it('sends {flag:"anomaly", action:"delete"} when Delete is clicked on an anomaly flag', async () => {
    mockPost.mockResolvedValue({ data: { ...BASE_TRANSACTION, isAnomaly: true, deletedAt: '2026-09-21T00:00:00.000Z' } });
    renderBanner({ ...BASE_TRANSACTION, isAnomaly: true });

    fireEvent.click(screen.getByRole('button', { name: en.transactions.flags.delete }));

    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/transactions/txn-1/resolve-flag', { flag: 'anomaly', action: 'delete' }));
  });
});
