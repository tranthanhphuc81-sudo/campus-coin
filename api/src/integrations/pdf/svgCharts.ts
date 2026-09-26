// ADR-PDF-01: these SVGs draw shapes only (arcs, rectangles, axis lines) — no `<text>` nodes.
// `svg-to-pdfkit` (used internally by pdfmake to render `svg` content nodes) does not pick up
// the document's registered Roboto font, so any label with Vietnamese diacritics must instead be
// rendered as a normal pdfmake text/table node placed next to the chart (see renderMonthlyReport.ts).

export type DoughnutSlice = {
  value: number;
  color: string;
};

export type MonthlyBarRow = {
  income: number;
  expense: number;
};

const DOUGHNUT_SIZE = 220;
const DOUGHNUT_CENTER = DOUGHNUT_SIZE / 2;
const DOUGHNUT_OUTER_RADIUS = 100;
const DOUGHNUT_INNER_RADIUS = 55;
const EMPTY_STATE_COLOR = "#d6dee8";

function polarPoint(radius: number, angleDeg: number): { x: number; y: number } {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: DOUGHNUT_CENTER + radius * Math.cos(angleRad),
    y: DOUGHNUT_CENTER + radius * Math.sin(angleRad),
  };
}

function buildDoughnutSlicePath(startAngle: number, endAngle: number): string {
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  const outerStart = polarPoint(DOUGHNUT_OUTER_RADIUS, startAngle);
  const outerEnd = polarPoint(DOUGHNUT_OUTER_RADIUS, endAngle);
  const innerEnd = polarPoint(DOUGHNUT_INNER_RADIUS, endAngle);
  const innerStart = polarPoint(DOUGHNUT_INNER_RADIUS, startAngle);

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${DOUGHNUT_OUTER_RADIUS} ${DOUGHNUT_OUTER_RADIUS} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${DOUGHNUT_INNER_RADIUS} ${DOUGHNUT_INNER_RADIUS} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    "Z",
  ].join(" ");
}

/** Builds a doughnut chart (category breakdown) as a pure-shape SVG string. */
export function buildDoughnutSvg(slices: DoughnutSlice[]): string {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  const paths =
    total <= 0
      ? [
          `<circle cx="${DOUGHNUT_CENTER}" cy="${DOUGHNUT_CENTER}" r="${(DOUGHNUT_OUTER_RADIUS + DOUGHNUT_INNER_RADIUS) / 2}" fill="none" stroke="${EMPTY_STATE_COLOR}" stroke-width="${DOUGHNUT_OUTER_RADIUS - DOUGHNUT_INNER_RADIUS}" />`,
        ]
      : (() => {
          let cursor = 0;
          return slices
            .filter((slice) => slice.value > 0)
            .map((slice) => {
              const startAngle = (cursor / total) * 360;
              cursor += slice.value;
              // Cap just under 360deg: two identical points collapse the arc into nothing.
              const endAngle = Math.min((cursor / total) * 360, 359.99);
              return `<path d="${buildDoughnutSlicePath(startAngle, endAngle)}" fill="${slice.color}" />`;
            });
        })();

  return `<svg width="${DOUGHNUT_SIZE}" height="${DOUGHNUT_SIZE}" viewBox="0 0 ${DOUGHNUT_SIZE} ${DOUGHNUT_SIZE}">${paths.join("")}</svg>`;
}

const BAR_WIDTH = 400;
const BAR_HEIGHT = 200;
const BAR_PADDING_BOTTOM = 10;
const BAR_PADDING_TOP = 10;
const BAR_AXIS_COLOR = "#5b6b7f";
const BAR_INCOME_COLOR = "#1e8e3e";
const BAR_EXPENSE_COLOR = "#c62828";

/** Builds a grouped bar chart (income vs. expense per month) as a pure-shape SVG string. */
export function buildMonthlyBarSvg(rows: MonthlyBarRow[]): string {
  const plotHeight = BAR_HEIGHT - BAR_PADDING_TOP - BAR_PADDING_BOTTOM;
  const baselineY = BAR_HEIGHT - BAR_PADDING_BOTTOM;
  const maxValue = Math.max(1, ...rows.flatMap((row) => [row.income, row.expense]));

  const groupWidth = BAR_WIDTH / Math.max(rows.length, 1);
  const barWidth = Math.min(28, groupWidth / 3);
  const barGap = 4;

  const bars = rows
    .map((row, index) => {
      const groupCenter = groupWidth * index + groupWidth / 2;
      const incomeHeight = (row.income / maxValue) * plotHeight;
      const expenseHeight = (row.expense / maxValue) * plotHeight;
      const incomeX = groupCenter - barWidth - barGap / 2;
      const expenseX = groupCenter + barGap / 2;

      return [
        `<rect x="${incomeX}" y="${baselineY - incomeHeight}" width="${barWidth}" height="${incomeHeight}" fill="${BAR_INCOME_COLOR}" />`,
        `<rect x="${expenseX}" y="${baselineY - expenseHeight}" width="${barWidth}" height="${expenseHeight}" fill="${BAR_EXPENSE_COLOR}" />`,
      ].join("");
    })
    .join("");

  const axisLine = `<line x1="0" y1="${baselineY}" x2="${BAR_WIDTH}" y2="${baselineY}" stroke="${BAR_AXIS_COLOR}" stroke-width="1" />`;

  return `<svg width="${BAR_WIDTH}" height="${BAR_HEIGHT}" viewBox="0 0 ${BAR_WIDTH} ${BAR_HEIGHT}">${axisLine}${bars}</svg>`;
}
