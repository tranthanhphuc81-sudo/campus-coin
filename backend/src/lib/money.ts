/**
 * money.ts
 * Decimal-safe money helpers. Money is NEVER handled as a JS float: values are Prisma.Decimal
 * internally and "12.50"-style strings in JSON (CLAUDE.md invariant, DB column Decimal(14,2)).
 * Main exports: Decimal, MoneyInput, toMoney, add, sub, sum, average, compare, isPositive,
 *               toMoneyString, formatMoney, assertMoneyMatchesCurrency, percentOf
 * Spec: docs/spec/06 §6.1 (money) · Rules: BR-TX-01
 */
import { CurrencyCode, MONEY_SCALE } from '@campuscoin/shared';
import { Prisma } from '../generated/prisma/client.js';
import { validationFailed } from './problem.js';

/** Decimal class used for all money arithmetic (decimal.js via Prisma). */
export const Decimal = Prisma.Decimal;
/** Decimal instance type. */
export type Decimal = Prisma.Decimal;

/** Anything accepted as a money value: a Decimal or a decimal string such as "12.50". */
export type MoneyInput = Decimal | string;

// Plain decimal notation only: optional minus, digits, optional fraction. No exponents, no spaces.
// Linear-time: the optional group starts with a literal "." so the digit runs cannot backtrack.
// eslint-disable-next-line security/detect-unsafe-regex
const DECIMAL_STRING = /^-?\d+(\.\d+)?$/;

/** Currencies whose amounts have no minor unit (displayed and rounded with 0 decimals). */
const ZERO_DECIMAL_CURRENCIES: ReadonlySet<string> = new Set([CurrencyCode.VND]);

/**
 * Parses a money value into a Decimal.
 * @param value - Decimal or plain decimal string ("12.5", "-3", "0.01").
 * @returns A new Decimal.
 * @throws TypeError when the string is not a plain decimal number (e.g. "1e3", "abc", "").
 */
export function toMoney(value: MoneyInput): Decimal {
  if (typeof value === 'string') {
    if (!DECIMAL_STRING.test(value.trim())) throw new TypeError(`Invalid money value: "${value}"`);
    return new Decimal(value.trim());
  }
  return new Decimal(value);
}

/**
 * Adds two money values.
 * @returns a + b as a Decimal.
 */
export function add(a: MoneyInput, b: MoneyInput): Decimal {
  return toMoney(a).plus(toMoney(b));
}

/**
 * Subtracts b from a.
 * @returns a − b as a Decimal.
 */
export function sub(a: MoneyInput, b: MoneyInput): Decimal {
  return toMoney(a).minus(toMoney(b));
}

/**
 * Sums a list of money values.
 * @param values - Values to add; an empty list sums to 0.
 * @returns The total as a Decimal.
 */
export function sum(values: readonly MoneyInput[]): Decimal {
  return values.reduce<Decimal>((total, v) => total.plus(toMoney(v)), new Decimal(0));
}

/**
 * Arithmetic mean of a list of money values (e.g. docs/spec/05b §5.9.1's avg3 — callers pass only
 * the months that actually have data, having already excluded months with none).
 * @param values - Non-empty list of money values.
 * @returns The mean as a Decimal.
 * @throws RangeError when `values` is empty (there is no meaningful average of zero numbers).
 */
export function average(values: readonly MoneyInput[]): Decimal {
  if (values.length === 0) throw new RangeError('average() requires at least one value.');
  return sum(values).dividedBy(values.length);
}

/**
 * Compares two money values.
 * @returns -1 if a < b, 0 if equal, 1 if a > b.
 */
export function compare(a: MoneyInput, b: MoneyInput): -1 | 0 | 1 {
  return toMoney(a).comparedTo(toMoney(b)) as -1 | 0 | 1;
}

/**
 * Tells whether a value is strictly greater than zero (BR-TX-01: amounts are always > 0).
 * @returns true when value > 0.
 */
export function isPositive(value: MoneyInput): boolean {
  return toMoney(value).greaterThan(0);
}

/**
 * Serialises a money value for JSON/DB: fixed scale, half-up rounding ("12.5" → "12.50").
 * @param value - Money value.
 * @param scale - Decimal places (default MONEY_SCALE = 2).
 * @returns Plain decimal string.
 */
export function toMoneyString(value: MoneyInput, scale: number = MONEY_SCALE): string {
  return toMoney(value).toFixed(scale, Decimal.ROUND_HALF_UP);
}

/**
 * Formats a money value for display, e.g. "$1,234.50" or "₫1,235".
 * The amount is passed to Intl as a string, so no float conversion happens.
 * @param value - Money value.
 * @param currency - ISO 4217 code (USD default; VND shown with 0 decimals).
 * @param locale - BCP 47 locale (default "en").
 * @returns Localised currency string.
 */
export function formatMoney(
  value: MoneyInput,
  currency: string = CurrencyCode.USD,
  locale = 'en',
): string {
  const digits = ZERO_DECIMAL_CURRENCIES.has(currency) ? 0 : MONEY_SCALE;
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  // Intl accepts decimal strings exactly (ECMA-402 "Intl.NumberFormat v3"); TS types lag behind.
  return formatter.format(toMoneyString(value, digits) as unknown as number);
}

/**
 * BR-TX-01: VND amounts must have 0 decimal places (no minor unit) — shared by both
 * `transactions.service.ts` and `recurring.service.ts` so the rule is enforced in exactly one
 * place instead of being duplicated (and potentially drifting) across modules.
 * @param amount - Decimal string amount to check.
 * @param currency - The owning user's currency (ISO 4217 code).
 * @throws {AppError} 422 validation-failed on field `amount` when `currency` is VND and `amount`
 *   is not a whole number.
 */
export function assertMoneyMatchesCurrency(amount: MoneyInput, currency: string): void {
  if (currency === CurrencyCode.VND && !toMoney(amount).isInteger()) {
    throw validationFailed([{ field: 'amount', message: 'Amounts in VND must be a whole number.' }]);
  }
}

/**
 * Rounded integer percentage of `numerator` over `denominator` (BR-BU-01: budget consumption %,
 * dashboard "% of total" widgets). Guards division by zero — a zero/negative denominator has no
 * meaningful percentage, so this returns 0 rather than throwing or returning Infinity/NaN.
 * @param numerator - Money value on top (e.g. spent amount).
 * @param denominator - Money value on the bottom (e.g. budget limit); `<= 0` returns 0.
 * @returns Whole percent, rounded half-up (e.g. 79.6 -> 80).
 */
export function percentOf(numerator: MoneyInput, denominator: MoneyInput): number {
  const den = toMoney(denominator);
  if (!den.greaterThan(0)) return 0;
  return toMoney(numerator).dividedBy(den).times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}
