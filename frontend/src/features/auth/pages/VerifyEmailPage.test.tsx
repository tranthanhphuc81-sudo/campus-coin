/**
 * VerifyEmailPage.test.tsx
 * Verifies C-H1 (docs/security/review-p19.md): the single-use, 24h-TTL verification token is
 * captured from the URL into state on mount and then stripped from the visible URL/history via
 * `history.replaceState`, but the captured value is still what gets sent to the API — stripping
 * the URL must never lose the token needed for the actual verify call.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { en } from '../../../i18n/en';
import VerifyEmailPage from './VerifyEmailPage';

vi.mock('../../../lib/apiClient/apiClient', () => ({ apiClient: { post: vi.fn() } }));

import { apiClient } from '../../../lib/apiClient/apiClient';

const mockPost = vi.mocked(apiClient.post);

describe('VerifyEmailPage', () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockPost.mockResolvedValue({} as never);
    // Keep jsdom's *real* `window.location` (used directly by the component's
    // `history.replaceState` call) in sync with the `MemoryRouter` entry below, so this test
    // exercises the exact same URL the component reads from/strips in a real browser.
    window.history.pushState({}, '', '/verify-email?token=abc123');
  });

  afterEach(() => {
    window.history.pushState({}, '', '/');
  });

  it('strips the token from the visible URL after mount but still submits it to the API', async () => {
    render(
      <MemoryRouter initialEntries={['/verify-email?token=abc123']}>
        <VerifyEmailPage />
      </MemoryRouter>,
    );

    // The token must be gone from the real, visible URL shortly after mount…
    await waitFor(() => {
      expect(window.location.search).not.toContain('token=');
    });
    expect(window.location.pathname).toBe('/verify-email');

    // …yet the originally-read token is still what gets sent to the API.
    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/auth/verify-email', { token: 'abc123' });
    });
    expect(await screen.findByText(en.auth.verifyEmail.success)).toBeInTheDocument();
  });
});
