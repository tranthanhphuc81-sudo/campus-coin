/**
 * upload.test.ts
 * Unit tests for `imports.upload.ts`'s pure helpers (`assertCsvFile`, `decodeCsvText`) and
 * `lib/strings.ts`'s `sanitizeFilename` (used on every upload's `originalFilename`).
 * Spec: docs/spec/09 §9.10 (file upload safety)
 */
import { describe, expect, it } from 'vitest';
import { assertCsvFile, decodeCsvText } from '../../../src/modules/imports/imports.upload.js';
import { sanitizeFilename } from '../../../src/lib/strings.js';

function file(overrides: Partial<{ originalname: string; mimetype: string; size: number }> = {}) {
  return { originalname: 'data.csv', mimetype: 'text/csv', size: 100, ...overrides };
}

describe('assertCsvFile', () => {
  it('accepts a .csv file with an accepted MIME type', () => {
    expect(() => assertCsvFile(file())).not.toThrow();
  });

  it('accepts text/plain (some browsers send this for .csv)', () => {
    expect(() => assertCsvFile(file({ mimetype: 'text/plain' }))).not.toThrow();
  });

  it('ignores a charset suffix on the MIME type', () => {
    expect(() => assertCsvFile(file({ mimetype: 'text/csv; charset=utf-8' }))).not.toThrow();
  });

  it('rejects a non-.csv extension', () => {
    expect(() => assertCsvFile(file({ originalname: 'data.txt' }))).toThrow();
  });

  it('rejects an unsupported MIME type', () => {
    expect(() => assertCsvFile(file({ mimetype: 'application/pdf' }))).toThrow();
  });

  it('rejects an empty file', () => {
    expect(() => assertCsvFile(file({ size: 0 }))).toThrow();
  });

  it('is case-insensitive on the extension', () => {
    expect(() => assertCsvFile(file({ originalname: 'DATA.CSV' }))).not.toThrow();
  });
});

describe('decodeCsvText', () => {
  it('decodes plain UTF-8 text', () => {
    expect(decodeCsvText(Buffer.from('date,amount\n2024-01-01,4.50', 'utf8'))).toBe('date,amount\n2024-01-01,4.50');
  });

  it('strips a leading UTF-8 BOM', () => {
    const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('date,amount', 'utf8')]);
    expect(decodeCsvText(withBom)).toBe('date,amount');
  });

  it('decodes valid non-ASCII UTF-8 text (Vietnamese)', () => {
    const text = 'mo ta,Ăn trưa tại canteen';
    expect(decodeCsvText(Buffer.from(text, 'utf8'))).toBe(text);
  });

  it('rejects invalid UTF-8 byte sequences', () => {
    const invalid = Buffer.from([0xc0, 0xc1, 0xff, 0xfe]);
    expect(() => decodeCsvText(invalid)).toThrow();
  });

  it('rejects text containing a NUL byte', () => {
    const withNul = Buffer.concat([Buffer.from('date,amount\n', 'utf8'), Buffer.from([0x00]), Buffer.from('2024-01-01,4.50', 'utf8')]);
    expect(() => decodeCsvText(withNul)).toThrow();
  });

  it('allows tab, LF and CR control characters', () => {
    const text = 'date\tamount\r\n2024-01-01\t4.50';
    expect(decodeCsvText(Buffer.from(text, 'utf8'))).toBe(text);
  });
});

describe('sanitizeFilename', () => {
  it('passes through a normal filename', () => {
    expect(sanitizeFilename('bank-export.csv')).toBe('bank-export.csv');
  });

  it('strips a directory path (path traversal defence)', () => {
    expect(sanitizeFilename('../../etc/passwd.csv')).toBe('passwd.csv');
    expect(sanitizeFilename('C:\\Users\\me\\data.csv')).toBe('data.csv');
  });

  it('replaces reserved characters', () => {
    expect(sanitizeFilename('a:b*c?.csv')).toBe('a_b_c_.csv');
  });

  it('strips control characters', () => {
    expect(sanitizeFilename('data\u0000\u0007.csv')).toBe('data.csv');
  });

  it('falls back to a default name when nothing usable remains', () => {
    expect(sanitizeFilename('....')).toBe('import.csv');
    expect(sanitizeFilename('')).toBe('import.csv');
  });

  it('caps the length at 255 characters', () => {
    const long = 'a'.repeat(300) + '.csv';
    expect(sanitizeFilename(long).length).toBeLessThanOrEqual(255);
  });
});
