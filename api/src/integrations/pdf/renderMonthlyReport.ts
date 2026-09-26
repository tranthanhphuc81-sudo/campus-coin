import {
  getCategoryBreakdownReport,
  getIncomeVsExpenseReport,
} from "../../modules/analytics/service.js";
import { listTransactions } from "../../modules/transactions/service.js";
import { validationFailed } from "../../lib/problem.js";
import { buildDoughnutSvg, buildMonthlyBarSvg } from "./svgCharts.js";
import { PDF_DEFAULT_FONT, pdfPrinter } from "./fonts.js";
import type { PdfContentNode, PdfDocumentDefinition } from "pdfmake";

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

// Fixed qualitative palette for the category doughnut — server-side rendering has no access to
// the frontend's CSS custom properties, so colors are hardcoded here (visual-only, not user data).
const CATEGORY_COLORS = [
  "#1f4e79",
  "#c62828",
  "#1e8e3e",
  "#b26a00",
  "#6a1b9a",
  "#00838f",
  "#ad1457",
  "#5b6b7f",
];

const TEXT_MUTED = "#5b6b7f";

function parseMonthRange(month: string): { from: string; to: string; label: string } {
  if (!MONTH_PATTERN.test(month)) {
    throw validationFailed([{ field: "month", message: "month must use YYYY-MM format." }]);
  }

  const [yearToken, monthToken] = month.split("-");
  const year = Number(yearToken);
  const monthIndex = Number(monthToken) - 1;
  const monthStart = new Date(Date.UTC(year, monthIndex, 1));
  const monthEnd = new Date(Date.UTC(year, monthIndex + 1, 0));

  const label = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(monthStart);

  return {
    from: monthStart.toISOString().slice(0, 10),
    to: monthEnd.toISOString().slice(0, 10),
    label,
  };
}

function money(amount: string): string {
  return `$${amount}`;
}

async function collectPdfBuffer(docDefinition: PdfDocumentDefinition): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pdfDoc = pdfPrinter.createPdfKitDocument(docDefinition);
    const chunks: Buffer[] = [];

    pdfDoc.on("data", (chunk: Buffer) => chunks.push(chunk));
    pdfDoc.on("end", () => resolve(Buffer.concat(chunks)));
    pdfDoc.on("error", reject);
    pdfDoc.end();
  });
}

/** Renders the monthly report PDF (ADR-PDF-01). Reuses analytics/transactions module queries. */
export async function renderMonthlyReport(userId: string, month: string): Promise<Buffer> {
  const range = parseMonthRange(month);

  const [expenseBreakdown, incomeBreakdown, trend, transactions] = await Promise.all([
    getCategoryBreakdownReport({ userId, from: range.from, to: range.to, type: "expense" }),
    getCategoryBreakdownReport({ userId, from: range.from, to: range.to, type: "income" }),
    getIncomeVsExpenseReport({ userId, months: 6 }),
    listTransactions(userId, { month }),
  ]);

  const income = Number(incomeBreakdown.totalAmount);
  const expense = Number(expenseBreakdown.totalAmount);
  const net = income - expense;

  const doughnutSvg = buildDoughnutSvg(
    expenseBreakdown.items.map((item, index) => ({
      value: Number(item.amount),
      color: CATEGORY_COLORS[index % CATEGORY_COLORS.length] as string,
    })),
  );

  const categoryLegendRows: PdfContentNode[][] = expenseBreakdown.items.map((item, index) => [
    {
      text: "\u25CF ",
      color: CATEGORY_COLORS[index % CATEGORY_COLORS.length] as string,
      bold: true,
    },
    { text: item.categoryName },
    { text: money(item.amount), alignment: "right" },
    { text: `${item.sharePct}%`, alignment: "right" },
  ]);

  const barSvg = buildMonthlyBarSvg(
    trend.data.map((row) => ({ income: Number(row.income), expense: Number(row.expense) })),
  );

  const trendLegendRows: PdfContentNode[][] = trend.data.map((row) => [
    { text: row.month },
    { text: money(row.income), alignment: "right" },
    { text: money(row.expense), alignment: "right" },
    { text: money(row.net), alignment: "right" },
  ]);

  const topTransactions = [...transactions]
    .sort((a, b) => Number(b.amount) - Number(a.amount))
    .slice(0, 5);

  const topTransactionRows: PdfContentNode[][] = topTransactions.map((transaction) => [
    { text: transaction.txnDate },
    { text: transaction.categoryName },
    { text: transaction.description ?? "" },
    { text: transaction.type === "income" ? "Income" : "Expense" },
    { text: money(transaction.amount), alignment: "right" },
  ]);

  const docDefinition: PdfDocumentDefinition = {
    info: {
      title: `Campus Coin monthly report - ${month}`,
      author: "Campus Coin",
    },
    defaultStyle: { font: PDF_DEFAULT_FONT, fontSize: 10, color: "#1f2d3d" },
    pageMargins: [40, 50, 40, 50],
    styles: {
      brand: { fontSize: 20, bold: true, color: "#1f4e79" },
      coverSubtitle: { fontSize: 14, color: TEXT_MUTED, margin: [0, 8, 0, 0] },
      coverMeta: { fontSize: 10, color: TEXT_MUTED, margin: [0, 40, 0, 0] },
      sectionTitle: { fontSize: 13, bold: true, margin: [0, 20, 0, 8] },
      tableHeader: { bold: true, fillColor: "#f1f5f9" },
      disclaimer: { fontSize: 9, italics: true, color: TEXT_MUTED, margin: [0, 24, 0, 0] },
    },
    content: [
      { text: "Campus Coin", style: "brand" },
      { text: "Monthly Report", style: "coverSubtitle" },
      { text: range.label, style: "coverSubtitle" },
      {
        text: `Generated on ${new Date().toISOString().slice(0, 10)}`,
        style: "coverMeta",
        pageBreak: "after",
      },
      { text: "Summary", style: "sectionTitle" },
      {
        table: {
          widths: ["*", "*", "*"],
          body: [
            [
              { text: "Income", style: "tableHeader" },
              { text: "Expense", style: "tableHeader" },
              { text: "Net", style: "tableHeader" },
            ],
            [
              { text: money(incomeBreakdown.totalAmount) },
              { text: money(expenseBreakdown.totalAmount) },
              { text: `$${net.toFixed(2)}` },
            ],
          ],
        },
        layout: "lightHorizontalLines",
      },
      { text: "By category (expenses)", style: "sectionTitle" },
      {
        columns: [
          { svg: doughnutSvg, width: 160, height: 160 },
          {
            table: {
              widths: ["auto", "*", "auto", "auto"],
              body:
                categoryLegendRows.length > 0
                  ? categoryLegendRows
                  : [[{ text: "No expense transactions this month.", colSpan: 4 }, "", "", ""]],
            },
            layout: "noBorders",
          },
        ],
        columnGap: 16,
      },
      { text: "Income vs. expense (last 6 months)", style: "sectionTitle" },
      {
        columns: [
          { svg: barSvg, width: 260, height: 130 },
          {
            table: {
              widths: ["auto", "auto", "auto", "auto"],
              body: [
                [
                  { text: "Month", style: "tableHeader" },
                  { text: "Income", style: "tableHeader" },
                  { text: "Expense", style: "tableHeader" },
                  { text: "Net", style: "tableHeader" },
                ],
                ...trendLegendRows,
              ],
            },
            layout: "lightHorizontalLines",
          },
        ],
        columnGap: 16,
      },
      { text: "Top transactions this month", style: "sectionTitle" },
      {
        table: {
          widths: ["auto", "auto", "*", "auto", "auto"],
          body: [
            [
              { text: "Date", style: "tableHeader" },
              { text: "Category", style: "tableHeader" },
              { text: "Description", style: "tableHeader" },
              { text: "Type", style: "tableHeader" },
              { text: "Amount", style: "tableHeader" },
            ],
            ...(topTransactionRows.length > 0
              ? topTransactionRows
              : [[{ text: "No transactions this month.", colSpan: 5 }, "", "", "", ""]]),
          ],
        },
        layout: "lightHorizontalLines",
      },
      {
        text: "This report is generated automatically from your recorded transactions. It is provided for reference only and is not financial advice.",
        style: "disclaimer",
      },
    ],
  };

  return collectPdfBuffer(docDefinition);
}
