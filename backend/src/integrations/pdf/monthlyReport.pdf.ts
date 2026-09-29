/**
 * monthlyReport.pdf.ts
 * Builds the monthly report PDF (docs/spec/05b §5.8: cover page, summary table, chart, top 10
 * transactions, disclaimer). Pure layout — every number/string here is already computed and
 * formatted by `reports.service.ts`; this module never touches Prisma or does money arithmetic.
 * The "chart" is a horizontal bar table drawn with pdfmake's own vector `canvas` primitives
 * (docs/spec/05b §5.8's own lighter alternative to a server-rendered canvas library) — see the
 * PROGRESS.md P12 entry for why `chartjs-node-canvas` (which needs the native `canvas` package)
 * was not used.
 * Main exports: renderMonthlyReportPdf, MonthlyReportPdfData
 * Spec: docs/spec/05b §5.8 · docs/spec/10 §10.1 ("< 3s" PDF generation budget)
 */
import type { Content, TableCell } from 'pdfmake';
import { configurePdfMake } from './fonts.js';

/** Document-definition type accepted by `pdfMake.createPdf`, derived from the instance itself so
 * this file never needs a direct (and, for this package's subpath, unreliable) type-only import. */
type DocDefinition = Parameters<ReturnType<typeof configurePdfMake>['createPdf']>[0];

/** One row of the category-breakdown bar chart/table. */
export interface MonthlyReportPdfCategoryRow {
  name: string;
  /** Hex colour for the bar swatch; falls back to a neutral grey when a category has none. */
  color: string;
  amountDisplay: string;
  sharePct: number;
  transactionCount: number;
}

/** One row of the top-10-transactions table. */
export interface MonthlyReportPdfTransactionRow {
  dateDisplay: string;
  description: string;
  categoryName: string;
  typeLabel: string;
  amountDisplay: string;
}

/** Everything the monthly report PDF renders — every value already formatted for display. */
export interface MonthlyReportPdfData {
  monthLabel: string;
  generatedAtDisplay: string;
  incomeDisplay: string;
  expenseDisplay: string;
  netDisplay: string;
  categoryBreakdown: MonthlyReportPdfCategoryRow[];
  topTransactions: MonthlyReportPdfTransactionRow[];
  /** `null` until P13 ships monthly AI insights. */
  insightSummary: string | null;
}

const DISCLAIMER = 'This report is for personal reference only and is not financial advice.';
const BAR_COLUMN_WIDTH = 150;
const NEUTRAL_BAR_COLOR = '#9fb0c3';

/** One bar-chart row: colour swatch + name, a proportional horizontal bar, amount + share%. */
function categoryRow(row: MonthlyReportPdfCategoryRow, maxAmount: number): TableCell[] {
  const amount = Number(row.amountDisplay.replace(/[^0-9.-]/g, '')) || 0;
  const barWidth = maxAmount > 0 ? Math.max(2, (amount / maxAmount) * BAR_COLUMN_WIDTH) : 2;
  return [
    { text: row.name, margin: [0, 4, 0, 0] },
    { canvas: [{ type: 'rect', x: 0, y: 6, w: barWidth, h: 10, r: 2, color: row.color || NEUTRAL_BAR_COLOR }] },
    { text: `${row.amountDisplay}  (${row.sharePct}%)`, margin: [0, 4, 0, 0], alignment: 'right' },
  ];
}

/** One row of the top-transactions table. */
function transactionRow(row: MonthlyReportPdfTransactionRow): TableCell[] {
  return [row.dateDisplay, row.description, row.categoryName, row.typeLabel, { text: row.amountDisplay, alignment: 'right' }];
}

/** Builds the pdfmake document definition for one month's report. */
function buildDocDefinition(data: MonthlyReportPdfData): DocDefinition {
  const maxCategoryAmount = Math.max(0, ...data.categoryBreakdown.map((row) => Number(row.amountDisplay.replace(/[^0-9.-]/g, '')) || 0));

  const content: Content[] = [
    { text: 'CampusCoin', style: 'brand' },
    { text: 'Monthly Spending Report', style: 'title' },
    { text: data.monthLabel, style: 'subtitle' },
    { text: `Generated ${data.generatedAtDisplay}`, style: 'meta' },

    { text: 'Summary', style: 'section' },
    {
      table: {
        widths: ['*', '*', '*'],
        body: [
          ['Income', 'Expense', 'Net'],
          [data.incomeDisplay, data.expenseDisplay, data.netDisplay],
        ],
      },
      layout: 'lightHorizontalLines',
    },

    { text: 'Spending by Category', style: 'section' },
    data.categoryBreakdown.length === 0
      ? { text: 'No expenses recorded this month.', style: 'empty' }
      : {
          table: {
            widths: ['*', BAR_COLUMN_WIDTH, 110],
            body: data.categoryBreakdown.map((row) => categoryRow(row, maxCategoryAmount)),
          },
          layout: 'lightHorizontalLines',
        },

    { text: 'Top Transactions', style: 'section' },
    data.topTransactions.length === 0
      ? { text: 'No transactions recorded this month.', style: 'empty' }
      : {
          table: {
            headerRows: 1,
            widths: [70, '*', 90, 50, 80],
            body: [
              ['Date', 'Description', 'Category', 'Type', 'Amount'] satisfies TableCell[],
              ...data.topTransactions.map(transactionRow),
            ],
          },
          layout: 'lightHorizontalLines',
        },
  ];

  if (data.insightSummary) {
    content.push({ text: 'AI Insight', style: 'section' }, { text: data.insightSummary, style: 'insight' });
  }

  content.push({ text: DISCLAIMER, style: 'disclaimer', margin: [0, 24, 0, 0] });

  return {
    content,
    defaultStyle: { font: 'Roboto', fontSize: 10 },
    styles: {
      brand: { fontSize: 12, bold: true, color: '#1f4e79' },
      title: { fontSize: 20, bold: true, margin: [0, 4, 0, 0] },
      subtitle: { fontSize: 14, margin: [0, 2, 0, 0] },
      meta: { fontSize: 9, color: '#5b6b7f', margin: [0, 2, 0, 16] },
      section: { fontSize: 13, bold: true, margin: [0, 16, 0, 6] },
      empty: { fontSize: 10, color: '#5b6b7f', italics: true },
      insight: { fontSize: 10, italics: true },
      disclaimer: { fontSize: 8, color: '#5b6b7f', italics: true },
    },
    pageMargins: [40, 40, 40, 40],
  };
}

/** Renders one month's report to a PDF buffer. Target < 3s (docs/spec/10 §10.1). */
export async function renderMonthlyReportPdf(data: MonthlyReportPdfData): Promise<Buffer> {
  const pdfMake = configurePdfMake();
  const pdf = pdfMake.createPdf(buildDocDefinition(data));
  return pdf.getBuffer();
}
