/**
 * ReportsForecastPage.test.tsx
 * Verifies: the insufficient-data message renders when `insufficientData` is true, and the
 * forecast summary + always-visible per-category table render when data is sufficient. The lazy
 * Chart.js chart is mocked out — this page's own logic (data selection, empty states, table) is
 * what's under test here, not canvas rendering.
 */
import { TransactionType, type ForecastNextMonthDto } from '@campuscoin/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { en } from '../../../i18n/en';
import * as hooksModule from '../hooks';
import ReportsForecastPage from './ReportsForecastPage';

vi.mock('../hooks');
vi.mock('../components/charts/ForecastBandChart', () => ({ default: () => <div data-testid="forecast-chart" /> }));

function mockForecastQuery(data: ForecastNextMonthDto) {
  vi.spyOn(hooksModule, 'useForecastNextMonthQuery').mockReturnValue({
    isLoading: false,
    isError: false,
    data,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof hooksModule.useForecastNextMonthQuery>);
}

describe('ReportsForecastPage', () => {
  it('shows the insufficient-data message', () => {
    mockForecastQuery({
      month: '2026-10-01',
      basisMonths: ['2026-07-01', '2026-08-01', '2026-09-01'],
      availableMonths: ['2026-09-01'],
      insufficientData: true,
      currency: 'USD',
      totals: { expense: null, income: null },
      history: [],
      categories: [],
    });

    render(<ReportsForecastPage />);

    expect(screen.getByText(en.reports.forecast.insufficientData)).toBeInTheDocument();
  });

  it('renders the forecast summary and per-category table when data is sufficient', async () => {
    mockForecastQuery({
      month: '2026-10-01',
      basisMonths: ['2026-07-01', '2026-08-01', '2026-09-01'],
      availableMonths: ['2026-07-01', '2026-08-01', '2026-09-01'],
      insufficientData: false,
      currency: 'USD',
      totals: {
        expense: { forecast: '300.00', lower: '250.00', upper: '350.00' },
        income: null,
      },
      history: [
        { month: '2026-07-01', expense: '280.00', income: '0.00' },
        { month: '2026-08-01', expense: '310.00', income: '0.00' },
        { month: '2026-09-01', expense: '290.00', income: '0.00' },
      ],
      categories: [
        {
          categoryId: 1,
          name: 'Dining',
          icon: 'bi-cup',
          color: '#c62828',
          type: TransactionType.EXPENSE,
          history: ['80.00', '90.00', '100.00'],
          wma: '90.00',
          recurring: '0.00',
          forecast: '95.00',
          lower: '80.00',
          upper: '110.00',
        },
      ],
    });

    render(<ReportsForecastPage />);

    expect(screen.getByText('Dining')).toBeInTheDocument();
    expect(screen.getByText(en.reports.forecast.tableTitle)).toBeInTheDocument();
    expect(await screen.findByTestId('forecast-chart')).toBeInTheDocument();
    // Only "Expense" is available (no income totals), so the type toggle should not render.
    expect(screen.queryByText(en.reports.forecast.typeIncome)).not.toBeInTheDocument();
  });
});
