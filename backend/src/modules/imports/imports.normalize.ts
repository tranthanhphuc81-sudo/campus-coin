/**
 * imports.normalize.ts
 * Turns one raw CSV row into a validated {@link StoredRowDraft}: locale-tolerant amount/date
 * parsing, type inference, and BR-TX-01/02 business-rule checks (delegated to
 * `transactions.service.ts`'s `collectBusinessRuleErrors`, never re-implemented here). No
 * category/AI/duplicate resolution happens here — see `imports.service.ts`.
 * Main exports: parseAmount, parseDate, detectDateFormat, looksNegativeAmountCell, buildRow
 * Spec: docs/spec/05a §5.5 (Table 19) · Rules: BR-TX-01, BR-TX-02
 */
import {
  DESCRIPTION_MAX_LENGTH,
  IMPORT_MAX_CELL_CHARS,
  ImportDateFormat,
  TransactionType,
  localDateSchema,
  moneyStringSchema,
  type ImportColumnMappingInput,
} from '@campuscoin/shared';
import { toMoneyString } from '../../lib/money.js';
import { collectBusinessRuleErrors } from '../transactions/transactions.service.js';
import type { StoredRawCells, StoredRowDraft, StoredRowError } from './imports.types.js';

const CURRENCY_SYMBOLS = /[$€₫]|VND|USD/gi;
const NBSP = /\u00A0/g;

/**
 * Cheap, batch-level heuristic ("does this file contain any negative amount at all") used to
 * decide whether type-inference-from-sign is even active for the whole file — never used to parse
 * an individual row's amount (see {@link parseAmount} for that).
 */
export function looksNegativeAmountCell(raw: string | null): boolean {
  if (!raw) return false;
  const s = raw.trim();
  return s.startsWith('-') || /^\(.*\)$/.test(s);
}

/**
 * Parses a locale-tolerant amount cell into a positive, 2-decimal money string (BR-TX-01: the
 * stored amount is always positive — sign comes from `type`, not the value).
 * @param raw - Raw cell text, e.g. `"$1,234.56"`, `"1.234,56"`, `"(4.50)"`, `"50,000 ₫"`.
 */
export function parseAmount(raw: string): { amount: string; negative: boolean } | { error: string } {
  let s = raw.trim();
  if (!s) return { error: 'Amount is required.' };

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }

  s = s.replace(NBSP, ' ').replace(CURRENCY_SYMBOLS, '').trim();

  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  } else if (s.startsWith('+')) {
    s = s.slice(1);
  }
  s = s.replace(/\s+/g, '');
  if (!s) return { error: 'Amount is required.' };

  const hasDot = s.includes('.');
  const hasComma = s.includes(',');
  let normalized: string;

  if (hasDot && hasComma) {
    const lastDot = s.lastIndexOf('.');
    const lastComma = s.lastIndexOf(',');
    const decimalSep = lastDot > lastComma ? '.' : ',';
    const thousandsSep = decimalSep === '.' ? ',' : '.';
    normalized = s.split(thousandsSep).join('');
    if (decimalSep === ',') normalized = normalized.replace(',', '.');
  } else if (hasDot || hasComma) {
    const sep = hasDot ? '.' : ',';
    const parts = s.split(sep);
    const groupsAfterFirst = parts.slice(1);
    // A separator repeated with every later group exactly 3 digits long ("50,000", "1.234.567")
    // is a thousands separator; otherwise the LAST group is the decimal fraction ("12,5" -> "12.5").
    const looksLikeThousands = groupsAfterFirst.length > 0 && groupsAfterFirst.every((g) => g.length === 3);
    normalized = looksLikeThousands ? parts.join('') : `${parts.slice(0, -1).join('')}.${parts[parts.length - 1]}`;
  } else {
    normalized = s;
  }

  const result = moneyStringSchema.safeParse(normalized);
  if (!result.success) return { error: 'Not a valid amount.' };
  return { amount: toMoneyString(result.data), negative };
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const SLASH_DATE = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/;

/** Whether `y-m-d` is a real calendar date (handles month lengths/leap years without a Date round-trip). */
function isValidYmd(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= daysInMonth;
}

function toIsoDate(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Parses a date cell. An ISO `YYYY-MM-DD` cell is always accepted as-is. A slash-separated cell
 * (`D/M/Y` or `M/D/Y`) is resolved unambiguously when only one reading is a real calendar date
 * (e.g. `31/01/2026` can only be DMY); when BOTH readings are plausible (e.g. `03/04/2026`),
 * `preferred` (the client's chosen `dateFormat`) decides.
 * @param raw - Raw cell text.
 * @param preferred - Which reading to use when a slash date is genuinely ambiguous.
 */
export function parseDate(raw: string, preferred: ImportDateFormat): { date: string; ambiguous: boolean } | { error: string } {
  const s = raw.trim();

  const iso = ISO_DATE.exec(s);
  if (iso) {
    const candidate = `${iso[1]}-${iso[2]}-${iso[3]}`;
    const parsed = localDateSchema.safeParse(candidate);
    return parsed.success ? { date: parsed.data, ambiguous: false } : { error: 'Not a valid date.' };
  }

  const slash = SLASH_DATE.exec(s);
  if (!slash) return { error: 'Not a valid date.' };
  const a = Number(slash[1]);
  const b = Number(slash[2]);
  const y = Number(slash[3]);

  const dmyValid = isValidYmd(y, b, a); // day=a, month=b
  const mdyValid = isValidYmd(y, a, b); // month=a, day=b

  let day: number;
  let month: number;
  let ambiguous: boolean;
  if (dmyValid && !mdyValid) {
    day = a;
    month = b;
    ambiguous = false;
  } else if (mdyValid && !dmyValid) {
    month = a;
    day = b;
    ambiguous = false;
  } else if (dmyValid && mdyValid) {
    ambiguous = true;
    if (preferred === ImportDateFormat.MDY) {
      month = a;
      day = b;
    } else {
      day = a;
      month = b;
    }
  } else {
    return { error: 'Not a valid date.' };
  }

  const parsed = localDateSchema.safeParse(toIsoDate(y, month, day));
  return parsed.success ? { date: parsed.data, ambiguous } : { error: 'Not a valid date.' };
}

/**
 * Infers the file's date format from its unambiguous rows (a day component > 12 can only be DMY,
 * and vice versa). Ties/no evidence default to DMY (this app's default timezone is
 * `Asia/Ho_Chi_Minh`, where DD/MM/YYYY is the locally expected reading).
 */
export function detectDateFormat(rawDateCells: string[]): ImportDateFormat {
  for (const raw of rawDateCells) {
    const slash = SLASH_DATE.exec(raw.trim());
    if (!slash) continue;
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    const y = Number(slash[3]);
    const dmyValid = isValidYmd(y, b, a);
    const mdyValid = isValidYmd(y, a, b);
    if (dmyValid && !mdyValid) return ImportDateFormat.DMY;
    if (mdyValid && !dmyValid) return ImportDateFormat.MDY;
  }
  return ImportDateFormat.DMY;
}

/** Context `buildRow` needs beyond one row's own cells — decided once per batch by `imports.service.ts`. */
export interface BuildRowContext {
  dateFormat: ImportDateFormat;
  currency: string;
  timezone: string;
  /** Whether the file's column mapping has a `type` column at all (batch-level fact). */
  hasTypeColumn: boolean;
  /** Whether to infer `type` from the amount's sign — only when there is no `type` column AND at least one row is negative. */
  inferSign: boolean;
}

/**
 * Maps one CSV record's cells through `mapping`, parses amount/date/type/description, and
 * collects every field-level error (never throws — a row with errors is simply excluded from
 * commit, per docs/spec/05a §5.5: "no data is written before the user confirms").
 */
export function buildRow(rowNumber: number, cells: string[], mapping: ImportColumnMappingInput, ctx: BuildRowContext): StoredRowDraft {
  const cellAt = (index: number | null): string | null => {
    if (index === null) return null;
    const value = cells[index];
    return value === undefined ? null : value.trim() || null;
  };

  const raw: StoredRawCells = {
    date: cellAt(mapping.date),
    amount: cellAt(mapping.amount),
    type: cellAt(mapping.type),
    description: cellAt(mapping.description),
    category: cellAt(mapping.category),
  };

  const errors: StoredRowError[] = [];

  if (cells.some((cell) => cell.length > IMPORT_MAX_CELL_CHARS)) {
    errors.push({ field: 'row', message: `A cell exceeds ${IMPORT_MAX_CELL_CHARS} characters.` });
  }

  const requiredIndexes = [mapping.date, mapping.amount, mapping.description].filter((i): i is number => i !== null);
  if (requiredIndexes.length > 0 && cells.length <= Math.max(...requiredIndexes)) {
    errors.push({ field: 'row', message: 'Missing column(s).' });
  }

  let txnDate: string | null = null;
  if (raw.date === null) {
    errors.push({ field: 'date', message: 'Date is required.' });
  } else {
    const parsed = parseDate(raw.date, ctx.dateFormat);
    if ('error' in parsed) errors.push({ field: 'date', message: parsed.error });
    else txnDate = parsed.date;
  }

  let amount: string | null = null;
  let negative = false;
  if (raw.amount === null) {
    errors.push({ field: 'amount', message: 'Amount is required.' });
  } else {
    const parsed = parseAmount(raw.amount);
    if ('error' in parsed) errors.push({ field: 'amount', message: parsed.error });
    else {
      amount = parsed.amount;
      negative = parsed.negative;
    }
  }

  let type: TransactionType;
  if (raw.type) {
    const t = raw.type.trim().toLowerCase();
    if (t === TransactionType.INCOME || t === TransactionType.EXPENSE) {
      type = t as TransactionType;
    } else {
      errors.push({ field: 'type', message: 'type must be "income" or "expense".' });
      type = TransactionType.EXPENSE;
    }
  } else if (!ctx.hasTypeColumn && ctx.inferSign) {
    type = negative ? TransactionType.EXPENSE : TransactionType.INCOME;
  } else {
    type = TransactionType.EXPENSE;
  }

  let description: string | null = null;
  if (raw.description === null) {
    errors.push({ field: 'description', message: 'Description is required.' });
  } else if (raw.description.length > DESCRIPTION_MAX_LENGTH) {
    errors.push({ field: 'description', message: `Description must be at most ${DESCRIPTION_MAX_LENGTH} characters.` });
  } else {
    description = raw.description;
  }

  if (amount !== null && txnDate !== null) {
    for (const ruleError of collectBusinessRuleErrors({ timezone: ctx.timezone, currency: ctx.currency }, amount, txnDate)) {
      errors.push(ruleError);
    }
  }

  return { rowNumber, raw, txnDate, amount, type, description, errors };
}
