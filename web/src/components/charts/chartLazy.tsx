import { lazy } from "react";
import type { ComponentType, LazyExoticComponent } from "react";

type LazyChartComponent = LazyExoticComponent<ComponentType<Record<string, unknown>>>;

export const LazyDoughnut: LazyChartComponent = lazy(async () => {
  await import("chart.js/auto");
  const module = await import("react-chartjs-2");
  return { default: module.Doughnut as ComponentType<Record<string, unknown>> };
});

export const LazyBar: LazyChartComponent = lazy(async () => {
  await import("chart.js/auto");
  const module = await import("react-chartjs-2");
  return { default: module.Bar as ComponentType<Record<string, unknown>> };
});

export const LazyLine: LazyChartComponent = lazy(async () => {
  await import("chart.js/auto");
  const module = await import("react-chartjs-2");
  return { default: module.Line as ComponentType<Record<string, unknown>> };
});
