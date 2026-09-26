import { useTheme } from "@/app/ThemeProvider";

const FALLBACK_COLORS = {
  text: "#1f2d3d",
  muted: "#5b6b7f",
  border: "#d6dee8",
  income: "#1e8e3e",
  expense: "#c62828",
  warning: "#b26a00",
  primary: "#1f4e79",
};

type ChartPalette = {
  text: string;
  muted: string;
  border: string;
  income: string;
  expense: string;
  warning: string;
  primary: string;
  series: string[];
};

function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") {
    return fallback;
  }

  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function useChartPalette(): ChartPalette {
  const { theme } = useTheme();
  void theme;

  const palette = {
    text: cssVar("--cc-text", FALLBACK_COLORS.text),
    muted: cssVar("--cc-text-muted", FALLBACK_COLORS.muted),
    border: cssVar("--cc-border", FALLBACK_COLORS.border),
    income: cssVar("--cc-income", FALLBACK_COLORS.income),
    expense: cssVar("--cc-expense", FALLBACK_COLORS.expense),
    warning: cssVar("--cc-warning", FALLBACK_COLORS.warning),
    primary: cssVar("--cc-primary", FALLBACK_COLORS.primary),
  };

  return {
    ...palette,
    series: [palette.expense, palette.income, palette.warning, palette.primary, palette.muted],
  };
}
