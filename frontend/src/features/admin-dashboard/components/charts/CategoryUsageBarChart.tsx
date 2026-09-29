/**
 * CategoryUsageBarChart.tsx
 * Chart.js horizontal bar chart of default-category usage (transaction count per category) for the
 * admin "Statistics" page. Only the Chart.js pieces this chart needs are registered — never
 * `chart.js/auto` — to keep the bundle within the initial-load budget (spec §10.1).
 * Exports: default (CategoryUsageBarChart)
 * Spec: docs/spec/05c §5.13 · docs/spec/10 §10.2 (lazy-load Chart.js)
 */
import type { AdminCategoryUsageDto } from '@campuscoin/shared';
import { BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Tooltip } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { en } from '../../../../i18n/en';
import { cssVar } from '../../../dashboard/components/charts/chartColors';

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);

interface CategoryUsageBarChartProps {
  items: AdminCategoryUsageDto[];
}

/** Horizontal bar chart of transaction count per default category, in the order given (transactionCount desc). */
export default function CategoryUsageBarChart({ items }: CategoryUsageBarChartProps) {
  const textColor = cssVar('--bs-body-color', '#1f2d3d');
  const gridColor = cssVar('--bs-border-color', '#dee2e6');
  const accentColor = cssVar('--bc-accent', '#1f4e79');

  return (
    <Bar
      data={{
        labels: items.map((item) => item.categoryName),
        datasets: [
          {
            label: en.adminStats.categoriesUsage.colTransactions,
            data: items.map((item) => item.transactionCount),
            backgroundColor: accentColor,
          },
        ],
      }}
      options={{
        indexAxis: 'y',
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: textColor }, grid: { color: gridColor } },
          y: { ticks: { color: textColor }, grid: { color: gridColor } },
        },
        plugins: { legend: { display: false } },
      }}
    />
  );
}
