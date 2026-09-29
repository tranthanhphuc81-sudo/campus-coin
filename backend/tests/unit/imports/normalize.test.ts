/**
 * normalize.test.ts
 * Unit tests for `imports.normalize.ts`: locale-tolerant amount/date parsing, date-format
 * detection, sign-inference heuristics, and full-row building (incl. BR-TX-01/02 delegation).
 * Spec: docs/spec/05a §5.5 (Table 19) · Rules: BR-TX-01, BR-TX-02
 */
import { describe, expect, it } from 'vitest';
import { ImportDateFormat } from '@campuscoin/shared';
import { buildRow, detectDateFormat, looksNegativeAmountCell, parseAmount, parseDate } from '../../../src/modules/imports/imports.normalize.js';

describe('parseAmount', () => {
  it.each([
    ['$1,234.56', '1234.56'],
    ['1.234,56', '1234.56'],
    ['12,5', '12.50'],
    ['50,000 ₫', '50000.00'],
  ])('parses %s -> %s', (raw, expected) => {
    const result = parseAmount(raw);
    expect(result).toMatchObject({ amount: expected, negative: false });
  });

  it('parses parentheses as a negative amount', () => {
    expect(parseAmount('(4.50)')).toMatchObject({ amount: '4.50', negative: true });
  });

  it('parses a leading minus as a negative amount', () => {
    expect(parseAmount('-4.50')).toMatchObject({ amount: '4.50', negative: true });
  });

  it('rejects a non-numeric value', () => {
    const result = parseAmount('abc');
    expect('error' in result).toBe(true);
  });

  it('rejects a blank value', () => {
    const result = parseAmount('   ');
    expect('error' in result).toBe(true);
  });

  it('rejects zero', () => {
    const result = parseAmount('0.00');
    expect('error' in result).toBe(true);
  });
});

describe('parseDate', () => {
  it('always accepts an ISO date regardless of the preferred format', () => {
    expect(parseDate('2024-03-15', ImportDateFormat.MDY)).toMatchObject({ date: '2024-03-15', ambiguous: false });
  });

  it('resolves an unambiguous DMY date (day > 12) regardless of preferred', () => {
    expect(parseDate('25/03/2024', ImportDateFormat.MDY)).toMatchObject({ date: '2024-03-25', ambiguous: false });
  });

  it('resolves an unambiguous MDY date (second number > 12) regardless of preferred', () => {
    expect(parseDate('03/25/2024', ImportDateFormat.DMY)).toMatchObject({ date: '2024-03-25', ambiguous: false });
  });

  it('uses the preferred format for a genuinely ambiguous date', () => {
    expect(parseDate('03/04/2024', ImportDateFormat.DMY)).toMatchObject({ date: '2024-04-03', ambiguous: true });
    expect(parseDate('03/04/2024', ImportDateFormat.MDY)).toMatchObject({ date: '2024-03-04', ambiguous: true });
  });

  it('rejects an impossible date (Feb 31)', () => {
    const result = parseDate('31/02/2024', ImportDateFormat.DMY);
    expect('error' in result).toBe(true);
  });

  it('rejects unparsable text', () => {
    expect('error' in parseDate('not a date', ImportDateFormat.DMY)).toBe(true);
  });
});

describe('detectDateFormat', () => {
  it('detects DMY from an unambiguous day > 12', () => {
    expect(detectDateFormat(['25/03/2024'])).toBe(ImportDateFormat.DMY);
  });

  it('detects MDY from an unambiguous second number > 12', () => {
    expect(detectDateFormat(['03/25/2024'])).toBe(ImportDateFormat.MDY);
  });

  it('defaults to DMY when every row is ambiguous or absent', () => {
    expect(detectDateFormat(['03/04/2024', '01/02/2024'])).toBe(ImportDateFormat.DMY);
    expect(detectDateFormat([])).toBe(ImportDateFormat.DMY);
  });
});

describe('looksNegativeAmountCell', () => {
  it.each([
    ['-5.00', true],
    ['(5.00)', true],
    ['5.00', false],
    ['', false],
  ])('%s -> %s', (raw, expected) => {
    expect(looksNegativeAmountCell(raw)).toBe(expected);
  });

  it('returns false for null', () => {
    expect(looksNegativeAmountCell(null)).toBe(false);
  });
});

describe('buildRow', () => {
  const mapping = { date: 0, amount: 1, type: 2, description: 3, category: 4 };
  const baseCtx = { dateFormat: ImportDateFormat.DMY, currency: 'USD', timezone: 'Asia/Ho_Chi_Minh', hasTypeColumn: true, inferSign: false };

  it('builds a fully valid row with no errors', () => {
    const row = buildRow(2, ['2024-01-15', '4.50', 'expense', 'Campus Cafe latte', 'Food'], mapping, baseCtx);
    expect(row).toMatchObject({
      rowNumber: 2,
      txnDate: '2024-01-15',
      amount: '4.50',
      type: 'expense',
      description: 'Campus Cafe latte',
      errors: [],
    });
  });

  it('flags a missing description as an error', () => {
    const row = buildRow(2, ['2024-01-15', '4.50', 'expense', '', 'Food'], mapping, baseCtx);
    expect(row.errors.some((e) => e.field === 'description')).toBe(true);
  });

  it('flags a ragged row missing required columns', () => {
    const row = buildRow(2, ['2024-01-15', '4.50'], mapping, baseCtx);
    expect(row.errors.some((e) => e.field === 'row')).toBe(true);
  });

  it('flags an invalid amount', () => {
    const row = buildRow(2, ['2024-01-15', 'abc', 'expense', 'Weird', 'Food'], mapping, baseCtx);
    expect(row.errors.some((e) => e.field === 'amount')).toBe(true);
  });

  it('flags an invalid type value', () => {
    const row = buildRow(2, ['2024-01-15', '4.50', 'refund', 'Weird', 'Food'], mapping, baseCtx);
    expect(row.errors.some((e) => e.field === 'type')).toBe(true);
  });

  it('defaults to expense when there is a type column but the cell is blank', () => {
    const row = buildRow(2, ['2024-01-15', '4.50', '', 'Coffee', 'Food'], mapping, baseCtx);
    expect(row.type).toBe('expense');
  });

  it('infers expense from a negative amount when there is no type column and inferSign is on', () => {
    const noTypeMapping = { ...mapping, type: null };
    const ctx = { ...baseCtx, hasTypeColumn: false, inferSign: true };
    const row = buildRow(2, ['2024-01-15', '-4.50', '', 'Refund', 'Food'], noTypeMapping, ctx);
    expect(row.type).toBe('expense');
    expect(row.amount).toBe('4.50');
  });

  it('infers income from a positive amount when there is no type column and inferSign is on', () => {
    const noTypeMapping = { ...mapping, type: null };
    const ctx = { ...baseCtx, hasTypeColumn: false, inferSign: true };
    const row = buildRow(2, ['2024-01-15', '300.00', '', 'Allowance', 'Allowance'], noTypeMapping, ctx);
    expect(row.type).toBe('income');
  });

  it('rejects a fractional VND amount (BR-TX-01, via collectBusinessRuleErrors)', () => {
    const row = buildRow(2, ['2024-01-15', '4.50', 'expense', 'Coffee', 'Food'], mapping, { ...baseCtx, currency: 'VND' });
    expect(row.errors.some((e) => e.field === 'amount')).toBe(true);
  });
});
