/**
 * SpendingDoughnutChart.tsx
 * Chart.js doughnut for the dashboard's "Spending breakdown" widget. Only the Chart.js pieces this
 * chart actually needs are registered (`ArcElement`, `Tooltip`, `Legend`) — never `chart.js/auto` —
 * to keep the bundle within the initial-load budget (spec §10.1). Loaded via `React.lazy` from
 * `SpendingBreakdownCard`, never part of the dashboard page's own chunk.
 * Exports: default (SpendingDoughnutChart)
 * Spec: docs/spec/05b §5.7 · docs/spec/10 §10.2 (lazy-load Chart.js)
 */
import type { DashboardCategoryBreakdownItem } from '@campuscoin/shared';
import { ArcElement, Chart as ChartJS, Legend, Tooltip } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import { CATEGORY_FALLBACK_PALETTE, cssVar } from './chartColors';

ChartJS.register(ArcElement, Tooltip, Legend);

interface SpendingDoughnutChartProps {
  items: DashboardCategoryBreakdownItem[];
}

/** Doughnut chart of this month's spending broken down by category. */
export default function SpendingDoughnutChart({ items }: SpendingDoughnutChartProps) {
  const textColor = cssVar('--bs-body-color', '#1f2d3d');

  return (
    <Doughnut
      data={{
        labels: items.map((item) => item.name),
        datasets: [
          {
            data: items.map((item) => Number(item.amount)),
            backgroundColor: items.map((item, index) => item.color ?? CATEGORY_FALLBACK_PALETTE[index % CATEGORY_FALLBACK_PALETTE.length]),
          },
        ],
      }}
      options={{
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: textColor } },
        },
      }}
    />
  );
}
