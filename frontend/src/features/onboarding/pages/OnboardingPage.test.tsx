/**
 * OnboardingPage.test.tsx
 * Verifies: step 1 renders first, "Next" advances to step 2 (and back with "Back"), and
 * "Skip for now" marks onboarding as done in localStorage without calling the API.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as AuthContextModule from '../../../lib/auth/AuthContext';
import { Role } from '@campuscoin/shared';
import type * as ReactRouter from 'react-router';
import { en } from '../../../i18n/en';
import OnboardingPage from './OnboardingPage';

vi.mock('../../../lib/apiClient/apiClient', () => ({
  apiClient: { patch: vi.fn().mockResolvedValue({ data: {} }) },
}));

vi.mock('../../../components/ToastProvider', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouter>();
  return { ...actual, useNavigate: () => vi.fn() };
});

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

describe('OnboardingPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: baseUser,
      isBootstrapping: false,
      login: vi.fn(),
      logout: vi.fn(),
      setUser: vi.fn(),
    });
  });

  it('starts on step 1 (allowance)', () => {
    render(<OnboardingPage />);
    expect(screen.getByText(en.onboarding.allowance.title)).toBeInTheDocument();
  });

  it('advances to step 2 on Next and back to step 1 on Back', () => {
    render(<OnboardingPage />);

    fireEvent.click(screen.getByRole('button', { name: en.onboarding.next }));
    expect(screen.getByText(en.onboarding.savingsGoal.title)).toBeInTheDocument();
    expect(screen.queryByText(en.onboarding.allowance.title)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: en.onboarding.back }));
    expect(screen.getByText(en.onboarding.allowance.title)).toBeInTheDocument();
  });

  it('marks onboarding as done on Skip without throwing', () => {
    render(<OnboardingPage />);

    expect(window.localStorage.getItem('cc.onboarding.u1')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: en.onboarding.skip }));
    expect(window.localStorage.getItem('cc.onboarding.u1')).toBe('done');
  });
});
