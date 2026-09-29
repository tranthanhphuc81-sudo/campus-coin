/**
 * ProtectedRoute.test.tsx
 * Verifies: renders the outlet when the role matches, redirects when there is no user,
 * redirects when the role does not match, and shows a loading state while bootstrapping.
 */
import { Role } from '@campuscoin/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import * as AuthContextModule from '../../lib/auth/AuthContext';
import { ProtectedRoute } from './ProtectedRoute';

/** Renders `ProtectedRoute` at `/app/secret` with a memory router so redirects are observable. */
function renderProtectedRoute() {
  const router = createMemoryRouter(
    [
      {
        path: '/app',
        element: <ProtectedRoute allow={[Role.STUDENT]} redirectTo="/login" />,
        children: [{ index: true, element: <div>Protected content</div> }],
      },
      { path: '/login', element: <div>Login page</div> },
    ],
    { initialEntries: ['/app'] },
  );
  return render(<RouterProvider router={router} />);
}

const baseUser = {
  id: 'u1',
  email: 'student@example.com',
  fullName: 'Student One',
  role: Role.STUDENT,
  status: 'active' as const,
  academicYear: null,
  monthlyAllowanceBaseline: null,
  monthlySavingsGoal: null,
  currency: 'USD' as const,
  timezone: 'Asia/Ho_Chi_Minh',
  preferences: null,
  aiOptIn: false,
  emailVerifiedAt: null,
  createdAt: new Date().toISOString(),
  mfaEnabled: false,
};

describe('ProtectedRoute', () => {
  it('renders the outlet when the user has an allowed role', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: baseUser,
      isBootstrapping: false,
      login: vi.fn(),
      logout: vi.fn(),
      setUser: vi.fn(),
    });

    renderProtectedRoute();

    expect(screen.getByText('Protected content')).toBeInTheDocument();
  });

  it('redirects to the given path when there is no user', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: null,
      isBootstrapping: false,
      login: vi.fn(),
      logout: vi.fn(),
      setUser: vi.fn(),
    });

    renderProtectedRoute();

    expect(screen.getByText('Login page')).toBeInTheDocument();
  });

  it('redirects when the user role is not allowed', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { ...baseUser, role: Role.ADMIN },
      isBootstrapping: false,
      login: vi.fn(),
      logout: vi.fn(),
      setUser: vi.fn(),
    });

    renderProtectedRoute();

    expect(screen.getByText('Login page')).toBeInTheDocument();
  });

  it('shows a loading state while the session is still bootstrapping', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: null,
      isBootstrapping: true,
      login: vi.fn(),
      logout: vi.fn(),
      setUser: vi.fn(),
    });

    renderProtectedRoute();

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
    expect(screen.queryByText('Login page')).not.toBeInTheDocument();
  });
});
