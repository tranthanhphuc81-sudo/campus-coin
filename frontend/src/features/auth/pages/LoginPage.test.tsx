/**
 * LoginPage.test.tsx
 * Verifies BR-AU-03: a failed login shows only the generic "invalid email or password" message
 * (never a field-specific error), regardless of whether the email or the password was wrong.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import * as AuthContextModule from '../../../lib/auth/AuthContext';
import { en } from '../../../i18n/en';
import LoginPage from './LoginPage';

describe('LoginPage', () => {
  it('shows a single generic error message and no field-specific errors on failed login', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: null,
      isBootstrapping: false,
      login: vi.fn().mockRejectedValue({ status: 401, type: 'unauthenticated', title: 'Unauthenticated', fieldErrors: {} }),
      logout: vi.fn(),
      setUser: vi.fn(),
    });

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    fireEvent.input(screen.getByLabelText(en.auth.login.email), { target: { value: 'student@example.com' } });
    fireEvent.input(screen.getByLabelText(en.auth.login.password), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: en.auth.login.submit }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(en.auth.login.genericError);
    });
    expect(screen.queryByText(/invalid-feedback/i)).not.toBeInTheDocument();
    expect(document.querySelectorAll('.invalid-feedback')).toHaveLength(0);
  });
});
