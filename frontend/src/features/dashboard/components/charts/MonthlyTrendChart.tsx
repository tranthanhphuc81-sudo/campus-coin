/**
 * MonthlyTrendChart.tsx
 * Chart.js grouped bar chart for the dashboard's "6-month trend" widget (income vs expense per
 * month). Only the Chart.js pieces this chart needs are registered (`BarElement`, `CategoryScale`,
 * `LinearScale`, `Tooltip`, `Legend`) — never `chart.js/auto`. Loaded via `React.lazy` from
 * `MonthlyTrendCard`.
 * Exports: default (MonthlyTrendChart)
 * Spec: docs/spec/05b §5.7 · docs/spec/10 §10.2 (lazy-load Chart.js)
 */
import type { DashboardMonthTrendItem } from '@campuscoin/shared';
import { BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Tooltip } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { en } from '../../../../i18n/en';
import { formatMonthLabel } from '../../../../lib/dates';
import { cssVar } from './chartColors';

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);

interface MonthlyTrendChartProps {
  items: DashboardMonthTrendItem[];
}

/** Grouped bar chart of income vs expense for the trailing months in `items`. */
export default function MonthlyTrendChart({ items }: MonthlyTrendChartProps) {
  const textColor = cssVar('--bs-body-color', '#1f2d3d');
  const gridColor = cssVar('--bs-border-color', '#dee2e6');
  const incomeColor = cssVar('--bc-income', '#1e8e3e');
  const expenseColor = cssVar('--bc-expense', '#c62828');

  return (
    <Bar
      data={{
        labels: items.map((item) => formatMonthLabel(item.month)),
        datasets: [
          { label: en.dashboard.balance.income, data: items.map((item) => Number(item.income)), backgroundColor: incomeColor },
          { label: en.dashboard.balance.expense, data: items.map((item) => Number(item.expense)), backgroundColor: expenseColor },
        ],
      }}
      options={{
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: textColor }, grid: { color: gridColor } },
          y: { ticks: { color: textColor }, grid: { color: gridColor } },
        },
        plugins: {
          legend: { position: 'bottom', labels: { color: textColor } },
        },
      }}
    />
  );
}
