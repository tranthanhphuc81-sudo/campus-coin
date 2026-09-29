/**
 * IncomeVsExpenseComboChart.tsx
 * Chart.js mixed bar+line chart for the "Income vs expense" report: grouped bars for income/
 * expense per month, with a net-savings line overlaid (docs/spec/05b §5.8 Bảng 22). Uses
 * react-chartjs-2's generic `Chart` component (not the `Bar`/`Line` shorthands, which only
 * auto-register their own single controller) — every Chart.js piece this mixed chart needs is
 * registered explicitly, never `chart.js/auto`.
 * Exports: default (IncomeVsExpenseComboChart)
 * Spec: docs/spec/05b §5.8 · docs/spec/10 §10.2 (lazy-load Chart.js)
 */
import type { ReportIncomeVsExpenseMonth } from '@campuscoin/shared';
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
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

ChartJS.register(BarController, BarElement, LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend);

interface IncomeVsExpenseComboChartProps {
  items: ReportIncomeVsExpenseMonth[];
}

/** Grouped income/expense bars with a net-savings line overlay, one point per month. */
export default function IncomeVsExpenseComboChart({ items }: IncomeVsExpenseComboChartProps) {
  const textColor = cssVar('--bs-body-color', '#1f2d3d');
  const gridColor = cssVar('--bs-border-color', '#dee2e6');
  const incomeColor = cssVar('--bc-income', '#1e8e3e');
  const expenseColor = cssVar('--bc-expense', '#c62828');
  const netColor = cssVar('--bs-primary', '#1f4e79');

  return (
    <Chart
      type="bar"
      data={{
        labels: items.map((item) => formatMonthLabel(item.month)),
        datasets: [
          { type: 'bar' as const, label: en.dashboard.balance.income, data: items.map((item) => Number(item.income)), backgroundColor: incomeColor },
          { type: 'bar' as const, label: en.dashboard.balance.expense, data: items.map((item) => Number(item.expense)), backgroundColor: expenseColor },
          {
            type: 'line' as const,
            label: en.dashboard.balance.net,
            data: items.map((item) => Number(item.net)),
            borderColor: netColor,
            backgroundColor: netColor,
            tension: 0.25,
          },
        ],
      }}
      options={{
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: textColor }, grid: { color: gridColor } },
          y: { ticks: { color: textColor }, grid: { color: gridColor } },
        },
        plugins: { legend: { position: 'bottom', labels: { color: textColor } } },
      }}
    />
  );
}
