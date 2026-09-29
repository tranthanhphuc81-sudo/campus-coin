/**
 * PrivacyTab.test.tsx
 * Verifies: clicking an export button calls `GET /me/export` with the right format and hands the
 * returned Blob to `downloadBlob`, and a 429 (rate-limited) response surfaces as a toast instead
 * of attempting a download.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type * as ReactRouter from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { en } from '../../../i18n/en';
import { PrivacyTab } from './PrivacyTab';

const { mockShowToast, mockDownloadBlob } = vi.hoisted(() => ({
  mockShowToast: vi.fn(),
  mockDownloadBlob: vi.fn(),
}));

vi.mock('../../../lib/apiClient/apiClient', () => ({ apiClient: { get: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));
vi.mock('../../../components/ToastProvider', () => ({ useToast: () => ({ showToast: mockShowToast }) }));
vi.mock('../../../lib/download', () => ({
  downloadBlob: mockDownloadBlob,
  filenameFromContentDisposition: (_header: unknown, fallback: string) => fallback,
}));
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouter>();
  return { ...actual, useNavigate: () => vi.fn() };
});
vi.mock('../../../lib/auth/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', aiOptIn: false }, setUser: vi.fn(), logout: vi.fn() }),
}));

import { apiClient } from '../../../lib/apiClient/apiClient';

function renderPrivacyTab() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PrivacyTab />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PrivacyTab', () => {
  it('downloads the JSON export via apiClient and downloadBlob', async () => {
    const blob = new Blob(['{}'], { type: 'application/json' });
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: blob, headers: {} });
    renderPrivacyTab();

    fireEvent.click(screen.getByRole('button', { name: en.profileSettings.privacy.exportButtonJson }));

    await waitFor(() =>
      expect(apiClient.get).toHaveBeenCalledWith('/me/export', { params: { format: 'json' }, responseType: 'blob' }),
    );
    await waitFor(() => expect(mockDownloadBlob).toHaveBeenCalledWith(blob, expect.stringContaining('campuscoin-export-')));
  });

  it('shows a rate-limit toast on a 429 response instead of downloading', async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockRejectedValue({
      status: 429,
      type: 'rate-limited',
      title: 'Too many requests',
      fieldErrors: {},
    });
    renderPrivacyTab();

    fireEvent.click(screen.getByRole('button', { name: en.profileSettings.privacy.exportButtonCsv }));

    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith({ message: en.profileSettings.privacy.exportRateLimited }));
    expect(mockDownloadBlob).not.toHaveBeenCalled();
  });
});
