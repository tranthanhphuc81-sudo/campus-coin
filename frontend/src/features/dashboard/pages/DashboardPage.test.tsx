/**
 * DashboardPage.test.tsx
 * Verifies the dashboard widget grid renders without crashing when every "not built yet" widget
 * is at its null/empty baseline (`budgets: []`, `savingsGoal: null`, `latestInsight: null`,
 * `tips: []`, `recentActivity: []`, `topCategory: null`) — the exact shape every real account has
 * until P13/P14 build those engines.
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { en } from '../../../i18n/en';
import * as AuthContextModule from '../../../lib/auth/AuthContext';
import * as QuickAddModule from '../../transactions/components/QuickAddContext';
import * as hooksModule from '../hooks';
import DashboardPage from './DashboardPage';

vi.mock('../hooks');
vi.mock('../../transactions/components/QuickAddContext');

describe('DashboardPage', () => {
  it('renders every widget in its empty/null-safe state without crashing', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: {
        id: 'u1',
        email: 's@example.com',
        fullName: 'Sam Student',
        role: 'student',
        status: 'active',
        academicYear: null,
        monthlyAllowanceBaseline: null,
        monthlySavingsGoal: null,
        currency: 'USD',
        timezone: 'UTC',
        preferences: null,
        aiOptIn: false,
        emailVerifiedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        mfaEnabled: false,
      },
      isBootstrapping: false,
      login: vi.fn(),
      logout: vi.fn(),
      setUser: vi.fn(),
    });
    vi.spyOn(QuickAddModule, 'useQuickAdd').mockReturnValue({ open: vi.fn() });
    vi.spyOn(hooksModule, 'useDashboardSummaryQuery').mockReturnValue({
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      data: {
        month: '2026-09-01',
        greetingName: 'Sam',
        totals: { income: '0.00', expense: '0.00', net: '0.00', incomeChangePct: null, expenseChangePct: null },
        topCategory: null,
        budgets: [],
        categoryBreakdown: [],
        monthlyTrend: [],
        savingsGoal: null,
        latestInsight: null,
        tips: [],
        recentActivity: [],
      },
    } as unknown as ReturnType<typeof hooksModule.useDashboardSummaryQuery>);

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    expect(screen.getByText(en.dashboard.topCategory.empty)).toBeInTheDocument();
    expect(screen.getByText(en.dashboard.budgetVsActual.empty)).toBeInTheDocument();
    expect(screen.getByText(en.dashboard.breakdown.empty)).toBeInTheDocument();
    expect(screen.getByText(en.dashboard.trend.empty)).toBeInTheDocument();
    expect(screen.getByText(en.dashboard.latestInsight.empty)).toBeInTheDocument();
    expect(screen.getByText(en.dashboard.tips.empty)).toBeInTheDocument();
    expect(screen.getByText(en.dashboard.recentActivity.empty)).toBeInTheDocument();
  });
});
