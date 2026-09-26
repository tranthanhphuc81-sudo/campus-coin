import { Suspense, useMemo } from "react";

import { formatMoney } from "@/lib/money";

import ChartCard from "./ChartCard";
import { LazyLine } from "./chartLazy";
import { useChartPalette } from "./useChartPalette";

type LineSeries = {
  label: string;
  values: Array<string>;
};

type LineChartProps = {
  title: string;
  subtitle?: string;
  labels: string[];
  series: LineSeries[];
  caption: string;
};

export default function LineChart({ title, subtitle, labels, series, caption }: LineChartProps) {
  const palette = useChartPalette();

  const chartData = useMemo(
    () => ({
      labels,
      datasets: series.map((item, index) => ({
        label: item.label,
        data: item.values.map((value) => Number(value)),
        borderColor: palette.series[index % palette.series.length],
        backgroundColor: palette.series[index % palette.series.length],
        tension: 0.3,
        pointRadius: 2,
        fill: false,
      })),
    }),
    [labels, palette.series, series],
  );

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          ticks: { color: palette.muted },
          grid: { color: palette.border },
        },
        y: {
          ticks: { color: palette.muted },
          grid: { color: palette.border },
        },
      },
      plugins: {
        legend: {
          labels: {
            color: palette.text,
          },
        },
      },
    }),
    [palette.border, palette.muted, palette.text],
  );

  const tableHeaders = ["Point", ...series.map((item) => item.label)];
  const tableRows = labels.map((label, index) => [
    label,
    ...series.map((item) => formatMoney(item.values[index] ?? "0")),
  ]);

  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      tableCaption={caption}
      tableHeaders={tableHeaders}
      tableRows={tableRows}
    >
      <div className="chart-canvas">
        <Suspense fallback={<div className="chart-loading" />}>
          <LazyLine data={chartData} options={options} />
        </Suspense>
      </div>
    </ChartCard>
  );
}
