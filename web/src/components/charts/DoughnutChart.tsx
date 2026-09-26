import { Suspense, useMemo } from "react";

import { formatMoney } from "@/lib/money";

import ChartCard from "./ChartCard";
import { LazyDoughnut } from "./chartLazy";
import { useChartPalette } from "./useChartPalette";

type DoughnutDatum = {
  label: string;
  value: string;
};

type DoughnutChartProps = {
  title: string;
  subtitle?: string;
  caption: string;
  data: DoughnutDatum[];
};

export default function DoughnutChart({ title, subtitle, caption, data }: DoughnutChartProps) {
  const palette = useChartPalette();

  const chartData = useMemo(
    () => ({
      labels: data.map((item) => item.label),
      datasets: [
        {
          data: data.map((item) => Number(item.value)),
          backgroundColor: data.map((_, index) => palette.series[index % palette.series.length]),
          borderColor: palette.border,
          borderWidth: 1,
        },
      ],
    }),
    [data, palette.border, palette.series],
  );

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom" as const,
          labels: {
            color: palette.text,
          },
        },
      },
    }),
    [palette.text],
  );

  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      tableCaption={caption}
      tableHeaders={["Category", "Amount"]}
      tableRows={data.map((item) => [item.label, formatMoney(item.value)])}
    >
      <div className="chart-canvas">
        <Suspense fallback={<div className="chart-loading" />}>
          <LazyDoughnut data={chartData} options={options} />
        </Suspense>
      </div>
    </ChartCard>
  );
}
