/**
 * csvSafe.test.ts
 * Unit tests for `lib/csvSafe.ts`: TC-19 formula-injection neutralisation, RFC 4180 quoting,
 * and full-document assembly (CRLF, BOM).
 * Spec: docs/spec/09 §9.10 (TC-19)
 */
import { describe, expect, it } from 'vitest';
import { escapeCsvField, neutralizeCsvCell, toCsv, toCsvLine } from '../../../src/lib/csvSafe.js';

describe('neutralizeCsvCell', () => {
  it.each(['=HYPERLINK("http://evil.example","x")', '+SUM(1,2)', '-1+1', '@SUM(1)', '\tevil', '\revil'])(
    'prefixes a leading formula-trigger character with a single quote: %s',
    (value) => {
      expect(neutralizeCsvCell(value).startsWith("'")).toBe(true);
      expect(neutralizeCsvCell(value)).toBe(`'${value}`);
    },
  );

  it('leaves a normal value unchanged', () => {
    expect(neutralizeCsvCell('Campus Cafe latte')).toBe('Campus Cafe latte');
  });
});

describe('escapeCsvField', () => {
  it('quotes a value containing a comma', () => {
    expect(escapeCsvField('a,b')).toBe('"a,b"');
  });

  it('quotes and doubles internal quotes', () => {
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
  });

  it('quotes a value containing a newline', () => {
    expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
  });

  it('leaves a plain value unchanged', () => {
    expect(escapeCsvField('plain value')).toBe('plain value');
  });
});

describe('toCsvLine', () => {
  it('renders numbers as-is (never neutralised/escaped)', () => {
    expect(toCsvLine([1, -5, 4.5])).toBe('1,-5,4.5');
  });

  it('renders null/undefined as empty cells', () => {
    expect(toCsvLine(['a', null, undefined])).toBe('a,,');
  });

  it('neutralises then escapes a formula-injection string cell', () => {
    // "=1+1,x" starts with "=" and contains a comma -> neutralised, then quoted.
    expect(toCsvLine(['=1+1,x'])).toBe('"\'=1+1,x"');
  });
});

describe('toCsv', () => {
  it('prepends a UTF-8 BOM by default and uses CRLF line endings', () => {
    const csv = toCsv(['a', 'b'], [['1', '2']]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('a,b\r\n1,2\r\n');
  });

  it('omits the BOM when bom:false', () => {
    const csv = toCsv(['a'], [['1']], { bom: false });
    expect(csv.startsWith('﻿')).toBe(false);
  });

  it('neutralises a formula-injection cell in a data row', () => {
    const csv = toCsv(['description'], [['=HYPERLINK("http://evil.example","x")']]);
    expect(csv).toContain("'=HYPERLINK");
  });
});
