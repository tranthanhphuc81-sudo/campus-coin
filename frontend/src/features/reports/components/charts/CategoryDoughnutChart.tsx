/**
 * CategoryDoughnutChart.tsx
 * Chart.js doughnut for the "By category" report (generalizes the dashboard's own
 * `SpendingDoughnutChart` to any {@link ReportCategoryBreakdownItem} list). Only the Chart.js
 * pieces this chart needs are registered — never `chart.js/auto`.
 * Exports: default (CategoryDoughnutChart)
 * Spec: docs/spec/05b §5.8 · docs/spec/10 §10.2 (lazy-load Chart.js)
 */
import type { ReportCategoryBreakdownItem } from '@campuscoin/shared';
import { ArcElement, Chart as ChartJS, Legend, Tooltip } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import { CATEGORY_FALLBACK_PALETTE, cssVar } from '../../../dashboard/components/charts/chartColors';

ChartJS.register(ArcElement, Tooltip, Legend);

interface CategoryDoughnutChartProps {
  items: ReportCategoryBreakdownItem[];
}

/** Doughnut chart of the queried period's totals broken down by category. */
export default function CategoryDoughnutChart({ items }: CategoryDoughnutChartProps) {
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
        plugins: { legend: { position: 'bottom', labels: { color: textColor } } },
      }}
    />
  );
}
