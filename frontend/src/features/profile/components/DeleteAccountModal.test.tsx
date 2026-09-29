/**
 * DeleteAccountModal.test.tsx
 * Verifies: the submit button stays disabled until the confirmation phrase matches exactly
 * (case-sensitive), a wrong-password (422) response surfaces as an inline field error without
 * logging the user out, and a successful deletion shows a success toast then logs the user out
 * and navigates to `/login`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type * as ReactRouter from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { en } from '../../../i18n/en';
import { DeleteAccountModal } from './DeleteAccountModal';

const mockShowToast = vi.fn();
const mockLogout = vi.fn();
const mockNavigate = vi.fn();

vi.mock('../../../lib/apiClient/apiClient', () => ({ apiClient: { delete: vi.fn() } }));
vi.mock('../../../components/ToastProvider', () => ({ useToast: () => ({ showToast: mockShowToast }) }));
vi.mock('../../../lib/auth/AuthContext', () => ({ useAuth: () => ({ logout: mockLogout }) }));
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouter>();
  return { ...actual, useNavigate: () => mockNavigate };
});

import { apiClient } from '../../../lib/apiClient/apiClient';

const t = en.profileSettings.privacy.deleteModal;

function renderModal() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DeleteAccountModal show onClose={vi.fn()} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockLogout.mockResolvedValue(undefined);
});

describe('DeleteAccountModal', () => {
  it('keeps the submit button disabled until the confirmation phrase matches exactly (case-sensitive)', () => {
    renderModal();
    const submitButton = screen.getByRole('button', { name: t.submit });
    const confirmInput = screen.getByLabelText(t.confirmLabel('DELETE'));

    expect(submitButton).toBeDisabled();

    fireEvent.change(confirmInput, { target: { value: 'delete' } });
    expect(submitButton).toBeDisabled();

    fireEvent.change(confirmInput, { target: { value: 'DELETE' } });
    expect(submitButton).not.toBeDisabled();
  });

  it('shows an inline password error on a wrong password (422) without logging the user out', async () => {
    (apiClient.delete as ReturnType<typeof vi.fn>).mockRejectedValue({
      status: 422,
      type: 'validation-failed',
      title: 'Validation failed',
      fieldErrors: { password: 'Incorrect password.' },
    });
    renderModal();

    fireEvent.change(screen.getByLabelText(t.passwordLabel), { target: { value: 'wrong-password' } });
    fireEvent.change(screen.getByLabelText(t.confirmLabel('DELETE')), { target: { value: 'DELETE' } });
    fireEvent.click(screen.getByRole('button', { name: t.submit }));

    expect(await screen.findByText('Incorrect password.')).toBeInTheDocument();
    expect(mockLogout).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('shows a success toast, logs out and navigates to /login on success', async () => {
    (apiClient.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { scheduledPurgeAt: '2026-10-28T00:00:00.000Z' } });
    renderModal();

    fireEvent.change(screen.getByLabelText(t.passwordLabel), { target: { value: 'correct-password' } });
    fireEvent.change(screen.getByLabelText(t.confirmLabel('DELETE')), { target: { value: 'DELETE' } });
    fireEvent.click(screen.getByRole('button', { name: t.submit }));

    await waitFor(() => expect(mockLogout).toHaveBeenCalled());
    expect(mockShowToast).toHaveBeenCalledWith({ message: t.success });
    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
  });
});
