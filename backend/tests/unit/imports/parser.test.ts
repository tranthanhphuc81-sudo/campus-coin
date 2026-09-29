/**
 * parser.test.ts
 * Unit tests for `imports.parser.ts`: delimiter auto-detection, streaming CSV tokenisation with
 * the P11 row/column caps enforced as a graceful `fatal` result, and header-to-column guessing.
 * Spec: docs/spec/05a §5.5 · docs/spec/09 §9.10 (size limits)
 */
import { describe, expect, it } from 'vitest';
import { IMPORT_MAX_COLUMNS, IMPORT_MAX_ROWS } from '@campuscoin/shared';
import { detectDelimiter, guessMapping, parseCsvRecords } from '../../../src/modules/imports/imports.parser.js';

describe('detectDelimiter', () => {
  it('detects a comma-delimited header', () => {
    expect(detectDelimiter('date,amount,type,description,category\n2024-01-01,4.50,expense,Coffee,Food')).toBe(',');
  });

  it('detects a semicolon-delimited header', () => {
    expect(detectDelimiter('date;amount;type;description;category\n2024-01-01;4,50;expense;Coffee;Food')).toBe(';');
  });

  it('defaults to comma on a tie (equal counts)', () => {
    expect(detectDelimiter('a,b;c')).toBe(',');
  });

  it('ignores delimiters inside quoted fields', () => {
    expect(detectDelimiter('"a;b;c";d;e;f;g')).toBe(';');
  });
});

describe('parseCsvRecords', () => {
  it('parses a header and data rows, numbering rows from 2', async () => {
    const result = await parseCsvRecords('date,amount\n2024-01-01,4.50\n2024-01-02,5.00', ',');
    expect(result.fatal).toBeUndefined();
    expect(result.headers).toEqual(['date', 'amount']);
    expect(result.records).toEqual([
      { rowNumber: 2, cells: ['2024-01-01', '4.50'] },
      { rowNumber: 3, cells: ['2024-01-02', '5.00'] },
    ]);
  });

  it('handles CRLF line endings', async () => {
    const result = await parseCsvRecords('date,amount\r\n2024-01-01,4.50\r\n', ',');
    expect(result.fatal).toBeUndefined();
    expect(result.records).toHaveLength(1);
  });

  it('accepts a ragged row (fewer cells than the header) via relax_column_count', async () => {
    const result = await parseCsvRecords('date,amount,type,description,category\n2024-01-01,4.50,expense', ',');
    expect(result.fatal).toBeUndefined();
    expect(result.records[0]!.cells).toEqual(['2024-01-01', '4.50', 'expense']);
  });

  it('returns a fatal result when the header has too many columns', async () => {
    const headers = Array.from({ length: IMPORT_MAX_COLUMNS + 1 }, (_, i) => `col${i}`).join(',');
    const result = await parseCsvRecords(headers, ',');
    expect(result.fatal).toMatchObject({ code: 'too-many-columns' });
  });

  it('returns a fatal result when a data row has too many columns', async () => {
    const header = 'a,b';
    const raggedRow = Array.from({ length: IMPORT_MAX_COLUMNS + 1 }, (_, i) => `v${i}`).join(',');
    const result = await parseCsvRecords(`${header}\n${raggedRow}`, ',');
    expect(result.fatal).toMatchObject({ code: 'too-many-columns' });
  });

  it('returns a fatal result when there are more than IMPORT_MAX_ROWS data rows', async () => {
    const header = 'date,amount';
    const rows = Array.from({ length: IMPORT_MAX_ROWS + 1 }, (_, i) => `2024-01-01,${i}`).join('\n');
    const result = await parseCsvRecords(`${header}\n${rows}`, ',');
    expect(result.fatal).toMatchObject({ code: 'too-many-rows' });
  });

  it('B-L3: returns a fatal (never throws) on malformed CSV, with a fixed generic message (never csv-parse\'s raw internals)', async () => {
    const result = await parseCsvRecords('date,amount\n"unterminated quote,4.50', ',');
    expect(result.fatal).toMatchObject({ code: 'malformed-csv', message: 'Could not parse this file as CSV.' });
    expect(result.fatal?.message).not.toMatch(/quote|closing|Invalid/i); // never csv-parse's own wording.
  });
});

describe('guessMapping', () => {
  it('maps standard English headers by exact name', () => {
    const mapping = guessMapping(['date', 'amount', 'type', 'description', 'category']);
    expect(mapping).toEqual({ date: 0, amount: 1, type: 2, description: 3, category: 4 });
  });

  it('is case-insensitive and matches common synonyms, including Vietnamese', () => {
    const mapping = guessMapping(['Transaction Date', 'So tien', 'Loai', 'Mo ta', 'Danh muc']);
    expect(mapping).toEqual({ date: 0, amount: 1, type: 2, description: 3, category: 4 });
  });

  it('leaves an unmatched column as null', () => {
    const mapping = guessMapping(['date', 'amount', 'description']);
    expect(mapping).toEqual({ date: 0, amount: 1, type: null, description: 2, category: null });
  });
});
