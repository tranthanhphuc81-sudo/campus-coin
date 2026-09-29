/**
 * IncomeExpenseBarChart.tsx
 * Chart.js grouped bar chart of income vs expense per label (day or ISO week) — shared by the
 * "Daily / weekly" report's two charts. Only the Chart.js pieces this chart needs are registered.
 * Exports: default (IncomeExpenseBarChart)
 * Spec: docs/spec/05b §5.8 · docs/spec/10 §10.2 (lazy-load Chart.js)
 */
import { BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Tooltip } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { en } from '../../../../i18n/en';
import { cssVar } from '../../../dashboard/components/charts/chartColors';

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);

interface IncomeExpenseBarChartProps {
  labels: string[];
  income: number[];
  expense: number[];
}

/** Grouped bar chart of income vs expense across `labels` (calendar days or ISO weeks). */
export default function IncomeExpenseBarChart({ labels, income, expense }: IncomeExpenseBarChartProps) {
  const textColor = cssVar('--bs-body-color', '#1f2d3d');
  const gridColor = cssVar('--bs-border-color', '#dee2e6');
  const incomeColor = cssVar('--bc-income', '#1e8e3e');
  const expenseColor = cssVar('--bc-expense', '#c62828');

  return (
    <Bar
      data={{
        labels,
        datasets: [
          { label: en.dashboard.balance.income, data: income, backgroundColor: incomeColor },
          { label: en.dashboard.balance.expense, data: expense, backgroundColor: expenseColor },
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
