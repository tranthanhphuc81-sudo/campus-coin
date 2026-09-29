/**
 * csvSafe.ts
 * Generic, RFC-4180-correct CSV builder used by every CSV export in this app (P11 import
 * template/error-report today; any future P12/P16 export). Every string cell is neutralised
 * against spreadsheet formula injection (TC-19: a leading `=`/`+`/`-`/`@`/tab/CR turns an
 * exported cell into a formula in Excel/Sheets unless prefixed with a literal `'`) before RFC
 * 4180 quoting is applied.
 * Main exports: CsvCell, neutralizeCsvCell, escapeCsvField, toCsvLine, toCsv
 * Spec: docs/spec/09 §9.10 (file safety, TC-19) · docs/spec/07 (CSV exports)
 */

/** One CSV cell value: strings are neutralised+escaped, numbers are emitted as-is, null/undefined -> empty. */
export type CsvCell = string | number | null | undefined;

/** First characters that spreadsheet software interprets as "this cell is a formula". */
const FORMULA_TRIGGER_CHARS = new Set(['=', '+', '-', '@', '\t', '\r']);

/**
 * TC-19: prefixes `value` with a single quote `'` when its first character would make a
 * spreadsheet interpret the cell as a formula — the leading `'` forces plain-text rendering in
 * Excel/Sheets/LibreOffice without changing what a non-spreadsheet CSV reader sees.
 * @param value - Raw (not yet RFC-4180-escaped) cell text.
 */
export function neutralizeCsvCell(value: string): string {
  const first = value.charAt(0);
  return FORMULA_TRIGGER_CHARS.has(first) ? `'${value}` : value;
}

/**
 * RFC 4180 field quoting: wraps `value` in double quotes (doubling any internal `"`) when it
 * contains a comma, quote, CR or LF — left untouched otherwise.
 * @param value - Cell text, already run through {@link neutralizeCsvCell} if it needed it.
 */
export function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Converts one cell to its final CSV text: strings are neutralised then escaped; numbers pass through untouched. */
function renderCell(cell: CsvCell): string {
  if (cell === null || cell === undefined) return '';
  if (typeof cell === 'number') return String(cell);
  return escapeCsvField(neutralizeCsvCell(cell));
}

/**
 * Joins one row's cells into a single CSV line (no trailing line ending).
 * @param cells - Row values, in column order.
 */
export function toCsvLine(cells: readonly CsvCell[]): string {
  return cells.map(renderCell).join(',');
}

/** Options for {@link toCsv}. */
export interface ToCsvOptions {
  /** Prepend the UTF-8 BOM so Excel correctly reads non-ASCII text. Default `true`. */
  bom?: boolean;
}

/**
 * Builds a complete CSV document: header row + data rows, CRLF line endings (RFC 4180 / Excel
 * expectation), optionally BOM-prefixed.
 * @param header - Column names.
 * @param rows - Data rows, each the same shape as `header`.
 * @param opts - See {@link ToCsvOptions}.
 */
export function toCsv(header: readonly string[], rows: readonly (readonly CsvCell[])[], opts: ToCsvOptions = {}): string {
  const lines = [toCsvLine(header), ...rows.map(toCsvLine)];
  const body = lines.join('\r\n') + '\r\n';
  return opts.bom === false ? body : '﻿' + body;
}
