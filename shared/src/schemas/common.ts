/**
 * common.ts
 * Small Zod building blocks reused by several P07 schemas (categories, transactions,
 * recurring rules): money strings, local calendar dates and numeric-id route params. Also
 * `noHtmlSchema` (P15): admin-authored free text (announcements, tip templates) must contain no
 * markup at all — the frontend never uses `dangerouslySetInnerHTML`, so the correct server-side
 * behaviour is to flatly reject `<`/`>` with a 422, not silently strip them.
 * Main exports: moneyStringSchema, moneyFilterSchema, localDateSchema, intIdParamSchema,
 *   uuidParamSchema, noHtmlSchema + inferred *Input types
 * Spec: docs/spec/05a §5.4 (BR-TX-01 amount, BR-TX-02 date range) · docs/spec/07 §7.1 (route params)
 *   · docs/spec/09 §9.13, docs/spec/05c Table 24 (admin content HTML-filtering)
 */
import { z } from 'zod';
import { TXN_DATE_MIN } from '../constants.js';

// Bounded digit counts (max 12 + max 2), so this cannot backtrack catastrophically.
// eslint-disable-next-line security/detect-unsafe-regex
const MONEY_STRING = /^\d{1,12}(\.\d{1,2})?$/;
const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Upper bound for a plain `INT` primary/foreign key column (signed INT32 max). B-L1: the
 * `\d{1,10}` id regexes below accept a value like `9999999999`, well above this — bounding it here
 * means an out-of-range id 404s/422s cleanly instead of reaching Prisma and surfacing as an
 * unmapped 500. */
export const MAX_INT_ID = 2_147_483_647;

/** True when the string contains at least one non-zero digit (i.e. the value is not exactly zero). */
function hasNonZeroDigit(value: string): boolean {
  return /[1-9]/.test(value);
}

/**
 * Plain positive decimal amount, e.g. `"12.50"` (BR-TX-01: amounts are always > 0; sign comes
 * from the transaction's `type`, never from the stored value). Rejects `"0"`/`"0.00"`.
 */
export const moneyStringSchema = z
  .string()
  .trim()
  .regex(MONEY_STRING, 'Must be a plain decimal amount, e.g. "12.50".')
  .refine(hasNonZeroDigit, 'Amount must be greater than 0.');

/**
 * Plain decimal amount used for `minAmount`/`maxAmount` list filters, where `0` is a valid bound
 * (unlike {@link moneyStringSchema}, which rejects zero for a stored transaction amount).
 */
export const moneyFilterSchema = z
  .string()
  .trim()
  .regex(MONEY_STRING, 'Must be a plain decimal amount, e.g. "12.50".');

/** True when year/month/day round-trip through a UTC `Date` unchanged (rejects e.g. 2026-02-30). */
function isRealCalendarDate(value: string): boolean {
  const m = LOCAL_DATE.exec(value);
  if (!m) return false;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

/**
 * Local calendar date `YYYY-MM-DD` (txn date, recurring rule start/end date). BR-TX-02: must be a
 * real calendar date on/after {@link TXN_DATE_MIN}; the "not more than 1 day in the future" bound
 * depends on the caller's clock/timezone, so it is enforced server-side, not in this schema.
 */
export const localDateSchema = z
  .string()
  .regex(LOCAL_DATE, 'Must be a date in YYYY-MM-DD format.')
  .refine(isRealCalendarDate, 'Not a real calendar date.')
  .refine((v) => v >= TXN_DATE_MIN, `Date must not be before ${TXN_DATE_MIN}.`);

/** Route param `{ id }` where `id` is a small positive integer (e.g. category id). B-L1: bounded to
 * {@link MAX_INT_ID} so an out-of-range value 404s cleanly instead of reaching Prisma. */
export const intIdParamSchema = z
  .object({
    id: z
      .string()
      .regex(/^\d{1,10}$/, 'Invalid id.')
      .transform(Number)
      .refine((n) => n <= MAX_INT_ID, 'Invalid id.'),
  })
  .strict();
/** Inferred input type of {@link intIdParamSchema}. */
export type IntIdParamInput = z.infer<typeof intIdParamSchema>;

/** Route param `{ id }` where `id` is a UUID (e.g. transaction id). */
export const uuidParamSchema = z.object({ id: z.uuid('Invalid id.') }).strict();
/** Inferred input type of {@link uuidParamSchema}. */
export type UuidParamInput = z.infer<typeof uuidParamSchema>;

/**
 * Rejects any string containing `<` or `>` (P15: admin-authored announcement/tip-template text).
 * Compose with `.pipe(noHtmlSchema)` after trimming/length-bounding a `z.string()` field.
 */
export const noHtmlSchema = z.string().refine((v) => !/[<>]/.test(v), 'Must not contain "<" or ">".');
