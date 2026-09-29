/**
 * stats.ts
 * Small decimal-safe descriptive-statistics helpers used by the anomaly detector and forecast
 * engine (P14 §5.14): mean, median and sample standard deviation over money-like values. Kept
 * separate from `lib/money.ts` — that file owns money arithmetic/formatting, this one owns
 * statistics built on top of it. All three return unrounded `Decimal`; callers round at the edge
 * with `toMoneyString` from `lib/money.ts`.
 * Main exports: mean, median, sampleStdDev
 * Spec: docs/spec/05c §5.14 (anomaly stats)
 */
import { Decimal, type MoneyInput, average, toMoney } from './money.js';

/**
 * Arithmetic mean of a list of money values. Thin re-export of `money.ts`'s `average()` so
 * `lib/stats.ts` is a one-stop import for anomaly/forecast statistics.
 * @param values - Non-empty list of money values.
 * @returns The mean as a Decimal.
 * @throws RangeError when `values` is empty.
 */
export function mean(values: readonly MoneyInput[]): Decimal {
  return average(values);
}

/**
 * Median of a list of money values. Sorts a COPY of the input (never mutates the caller's array).
 * @param values - Non-empty list of money values.
 * @returns The median as a Decimal (average of the two middle values on an even-length list).
 * @throws RangeError when `values` is empty.
 */
export function median(values: readonly MoneyInput[]): Decimal {
  if (values.length === 0) throw new RangeError('median() requires at least one value.');
  const sorted = values.map(toMoney).sort((a, b) => a.comparedTo(b));
  const mid = Math.floor(sorted.length / 2);
  // mid (and mid-1 on the even branch) are always valid indices given the length check above.
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return sorted[mid - 1]!.plus(sorted[mid]!).dividedBy(2);
}

/**
 * Sample standard deviation (divides by n-1, i.e. Bessel's correction) of a list of money values,
 * computed as `sqrt(sum((x - mean)^2) / (n - 1))` using `Decimal`'s own `.sqrt()`.
 * @param values - List with at least 2 values (n-1 must be positive).
 * @returns The sample standard deviation as a Decimal.
 * @throws RangeError when `values` has fewer than 2 entries.
 */
export function sampleStdDev(values: readonly MoneyInput[]): Decimal {
  if (values.length < 2) throw new RangeError('sampleStdDev() requires at least 2 values.');
  const decimals = values.map(toMoney);
  const avg = mean(decimals);
  const sumSquares = decimals.reduce((total, v) => total.plus(v.minus(avg).pow(2)), new Decimal(0));
  return sumSquares.dividedBy(decimals.length - 1).sqrt();
}
