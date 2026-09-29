/**
 * ForecastBandChart.tsx
 * Chart.js combo chart for the "Forecast" report tab (P14, docs/spec/05c §5.14): bars for the 3
 * known basis months, a dashed line connecting the last known month to next month's point
 * estimate, and a shaded +-1 stdDev range band (`Filler` between an upper/lower line pair). Only
 * the Chart.js pieces this chart needs are registered, mirroring
 * `IncomeVsExpenseComboChart.tsx`'s explicit-registration pattern — never `chart.js/auto`.
 * Exports: default (ForecastBandChart)
 * Spec: docs/spec/05c §5.14 · docs/spec/10 §10.2 (lazy-load Chart.js)
 */
import type { ForecastBand } from '@campuscoin/shared';
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
import { en } from '../../../../i18n/en';
import { formatMonthLabel } from '../../../../lib/dates';
import { cssVar } from '../../../dashboard/components/charts/chartColors';

ChartJS.register(BarController, BarElement, LineController, LineElement, PointElement, CategoryScale, LinearScale, Filler, Tooltip, Legend);

interface ForecastBandChartProps {
  /** The 3 basis months used for the forecast, oldest-first. */
  basisMonths: string[];
  /** The forecast (target) month. */
  targetMonth: string;
  /** Actual totals for the 3 basis months, oldest-first, for the currently selected type. */
  actualHistory: number[];
  /** Next month's point estimate + its +-1 stdDev range, for the currently selected type. */
  band: ForecastBand;
}

/** Bars for the 3 known months, a forecast line into next month, and a shaded likely-range band. */
export default function ForecastBandChart({ basisMonths, targetMonth, actualHistory, band }: ForecastBandChartProps) {
  const textColor = cssVar('--bs-body-color', '#1f2d3d');
  const gridColor = cssVar('--bs-border-color', '#dee2e6');
  const actualColor = cssVar('--bs-primary', '#1f4e79');
  const forecastColor = cssVar('--bc-expense', '#c62828');
  const bandColor = 'rgba(198, 40, 40, 0.15)';

  const labels = [...basisMonths.map(formatMonthLabel), formatMonthLabel(targetMonth)];
  // The last basis month's own actual value, so the forecast line and range band visually connect
  // to the known data instead of starting from nothing.
  const lastActual = actualHistory[actualHistory.length - 1] ?? 0;
  const forecastValue = Number(band.forecast);
  const upperValue = Number(band.upper);
  const lowerValue = Number(band.lower);

  return (
    <Chart
      type="bar"
      data={{
        labels,
        datasets: [
          {
            type: 'bar' as const,
            label: en.reports.forecast.legendActual,
            data: [...actualHistory, null],
            backgroundColor: actualColor,
          },
          {
            type: 'line' as const,
            label: en.reports.forecast.legendForecast,
            data: [null, null, lastActual, forecastValue],
            borderColor: forecastColor,
            backgroundColor: forecastColor,
            borderDash: [6, 4],
            spanGaps: true,
          },
          {
            // Invisible helper line the band fills against — never shown in the legend.
            type: 'line' as const,
            label: '',
            data: [null, null, lastActual, lowerValue],
            borderWidth: 0,
            pointRadius: 0,
            spanGaps: true,
          },
          {
            type: 'line' as const,
            label: en.reports.forecast.legendRange,
            data: [null, null, lastActual, upperValue],
            borderWidth: 0,
            pointRadius: 0,
            backgroundColor: bandColor,
            fill: '-1',
            spanGaps: true,
          },
        ],
      }}
      options={{
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: textColor }, grid: { color: gridColor } },
          y: { ticks: { color: textColor }, grid: { color: gridColor } },
        },
        plugins: {
          legend: { position: 'bottom', labels: { color: textColor, filter: (item) => item.text !== '' } },
        },
      }}
    />
  );
}
