/**
 * imports.parser.ts
 * Pure CSV-structure parsing for the import wizard: delimiter auto-detection, streaming
 * tokenisation (csv-parse) with the P11 size limits enforced as a graceful `fatal` result (never
 * an uncaught throw across the async iteration boundary), and best-effort column-mapping guesses
 * from a header row. No business-rule validation happens here — see `imports.normalize.ts`.
 * Main exports: detectDelimiter, parseCsvRecords, guessMapping, ParsedCsvRecord, ParsedCsvResult
 * Spec: docs/spec/05a §5.5 (CSV import) · docs/spec/09 §9.10 (size limits)
 */
import { Readable } from 'node:stream';
import { parse } from 'csv-parse';
import { IMPORT_CSV_COLUMNS, IMPORT_MAX_COLUMNS, IMPORT_MAX_ROWS, type ImportColumnMappingInput } from '@campuscoin/shared';
import { logger } from '../../lib/logger.js';
import { normalizeMerchantKey } from '../../lib/merchantKey.js';

/** Generic client-facing message for any csv-parse failure (B-L3: the real `err.message` is only
 * ever logged server-side — returning it verbatim to the client is an information-leak pattern,
 * since an internal error's message would leak the same way if this code path ever changes). */
const MALFORMED_CSV_MESSAGE = 'Could not parse this file as CSV.';

/** One tokenised CSV data row (never the header row). `rowNumber` is the 1-based spreadsheet line (header = row 1). */
export interface ParsedCsvRecord {
  rowNumber: number;
  cells: string[];
}

/** Result of {@link parseCsvRecords}: either a header + records, or a `fatal` reason (never both). */
export interface ParsedCsvResult {
  headers: string[];
  records: ParsedCsvRecord[];
  fatal?: { code: string; message: string };
}

/**
 * Auto-detects `,` vs `;` by counting occurrences OUTSIDE quoted fields on the first line only —
 * good enough for a header row, which is never expected to contain a quoted delimiter itself.
 * @param text - Decoded CSV text (BOM already stripped).
 * @returns `';'` only when semicolons strictly outnumber commas on the first line; `','` otherwise (tie -> comma).
 */
export function detectDelimiter(text: string): ',' | ';' {
  const firstLine = text.split(/\r\n|\r|\n/, 1)[0] ?? '';
  let inQuotes = false;
  let commas = 0;
  let semicolons = 0;
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch === ',') commas++;
    else if (!inQuotes && ch === ';') semicolons++;
  }
  return semicolons > commas ? ';' : ',';
}

/**
 * Streams `text` through csv-parse and returns every row as a plain string array, enforcing the
 * P11 row/column caps as a graceful `fatal` (never throws past this function — a csv-parse error
 * itself also becomes a `fatal`, not an uncaught rejection).
 * @param text - Decoded CSV text (BOM already stripped).
 * @param delimiter - `,` or `;` (see {@link detectDelimiter}).
 * @returns Header row + data records (`rowNumber` starts at 2), or a `fatal` reason.
 */
export async function parseCsvRecords(text: string, delimiter: ',' | ';'): Promise<ParsedCsvResult> {
  const parser = parse({ delimiter, relax_column_count: true, skip_empty_lines: true, relax_quotes: false, trim: false });
  Readable.from([text]).pipe(parser);

  let headers: string[] = [];
  const records: ParsedCsvRecord[] = [];
  let rowNumber = 1; // row 1 is the header row.

  try {
    for await (const rawRecord of parser as AsyncIterable<string[]>) {
      if (rowNumber === 1) {
        headers = rawRecord;
        if (headers.length > IMPORT_MAX_COLUMNS) {
          return { headers: [], records: [], fatal: { code: 'too-many-columns', message: `File has more than ${IMPORT_MAX_COLUMNS} columns.` } };
        }
        rowNumber++;
        continue;
      }

      if (rawRecord.length > IMPORT_MAX_COLUMNS) {
        return { headers: [], records: [], fatal: { code: 'too-many-columns', message: `File has more than ${IMPORT_MAX_COLUMNS} columns.` } };
      }
      records.push({ rowNumber, cells: rawRecord });
      rowNumber++;

      if (records.length > IMPORT_MAX_ROWS) {
        return { headers: [], records: [], fatal: { code: 'too-many-rows', message: `File has more than ${IMPORT_MAX_ROWS} data rows.` } };
      }
    }
  } catch (err) {
    // B-L3: log the real error server-side only; the client always gets the fixed generic message.
    logger.warn({ err }, '[imports] csv-parse failed');
    return { headers: [], records: [], fatal: { code: 'malformed-csv', message: MALFORMED_CSV_MESSAGE } };
  }

  return { headers, records };
}

/** Synonym lists (already lower-case, no diacritics — matched via `normalizeMerchantKey`) per canonical column. */
const SYNONYMS: Record<(typeof IMPORT_CSV_COLUMNS)[number], string[]> = {
  date: ['date', 'txn date', 'transaction date', 'ngay'],
  amount: ['amount', 'value', 'so tien'],
  type: ['type', 'loai'],
  description: ['description', 'desc', 'memo', 'note', 'details', 'mo ta'],
  category: ['category', 'danh muc'],
};

/**
 * Best-effort column-mapping guess from a header row: case-insensitive, diacritic-folded
 * (`normalizeMerchantKey`) matching against {@link SYNONYMS}. A header matching no synonym for a
 * given canonical column leaves it unmapped (`null`) — `date`/`amount`/`description` unmapped is a
 * "needs manual mapping" state the caller (`imports.service.ts`) must surface, not crash on.
 * @param headers - Raw header cells.
 */
export function guessMapping(headers: string[]): ImportColumnMappingInput {
  const normalizedHeaders = headers.map((h) => normalizeMerchantKey(h));
  const mapping: Record<string, number | null> = { date: null, amount: null, type: null, description: null, category: null };

  for (const field of IMPORT_CSV_COLUMNS) {
    const synonyms = SYNONYMS[field];
    const index = normalizedHeaders.findIndex((h) => h !== null && synonyms.includes(h));
    // `field` only ever iterates the fixed IMPORT_CSV_COLUMNS tuple, never client input.
    // eslint-disable-next-line security/detect-object-injection
    mapping[field] = index === -1 ? null : index;
  }

  return mapping as unknown as ImportColumnMappingInput;
}
