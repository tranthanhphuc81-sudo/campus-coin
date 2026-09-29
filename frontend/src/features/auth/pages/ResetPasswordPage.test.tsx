/**
 * ResetPasswordPage.test.tsx
 * Verifies C-H1 (docs/security/review-p19.md): the single-use, 30-min-TTL reset token is
 * captured from the URL into state on mount and then stripped from the visible URL/history via
 * `history.replaceState`, but the captured value is still what gets sent to the API on submit —
 * stripping the URL must never lose the token needed for the actual reset call.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { en } from '../../../i18n/en';
import ResetPasswordPage from './ResetPasswordPage';

vi.mock('../../../lib/apiClient/apiClient', () => ({ apiClient: { post: vi.fn() } }));

import { apiClient } from '../../../lib/apiClient/apiClient';

const mockPost = vi.mocked(apiClient.post);

/** Valid new-password value satisfying `passwordSchema` (min 10 chars). */
const NEW_PASSWORD = 'P@ssword1234';

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    mockPost.mockReset();
    // Keep jsdom's *real* `window.location` (used directly by the component's
    // `history.replaceState` call) in sync with the `MemoryRouter` entry below, so this test
    // exercises the exact same URL the component reads from/strips in a real browser.
    window.history.pushState({}, '', '/reset-password?token=abc123');
  });

  afterEach(() => {
    window.history.pushState({}, '', '/');
  });

  it('strips the token from the visible URL after mount but still submits it to the API', async () => {
    render(
      <MemoryRouter initialEntries={['/reset-password?token=abc123']}>
        <ResetPasswordPage />
      </MemoryRouter>,
    );

    // The token must be gone from the real, visible URL shortly after mount…
    await waitFor(() => {
      expect(window.location.search).not.toContain('token=');
    });
    expect(window.location.pathname).toBe('/reset-password');

    // …yet the form still works and sends the originally-read token to the API.
    fireEvent.input(screen.getByLabelText(en.auth.resetPassword.newPassword), {
      target: { value: NEW_PASSWORD },
    });
    fireEvent.click(screen.getByRole('button', { name: en.auth.resetPassword.submit }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/auth/reset-password', {
        token: 'abc123',
        newPassword: NEW_PASSWORD,
      });
    });
  });
});
