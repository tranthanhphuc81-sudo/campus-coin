/**
 * forecast.ts
 * Pure next-month spending/income forecast: a 3-month weighted moving average (WMA) plus a known
 * recurring amount, with a +-1 sample-stdDev band (docs/spec/05c §5.14). No DB access — the
 * caller (a later P14 stage's forecast service) gathers `monthly`/`recurring` from Prisma and
 * hands them to this function per category (and once for the overall totals).
 * Main exports: ForecastSeriesInput, ForecastSeriesResult, forecastSeries
 * Spec: docs/spec/05c §5.14
 */
import { FORECAST_MIN_DATA_MONTHS, FORECAST_WEIGHTS } from '@campuscoin/shared';
import { Decimal, type MoneyInput, add, toMoney } from './money.js';
import { sampleStdDev } from './stats.js';

/** Input to {@link forecastSeries}: one category's (or the overall) trailing 3 months of data. */
export interface ForecastSeriesInput {
  /** Oldest-first, exactly 3 entries `[M-3, M-2, M-1]`. `null` = that month had no data at all
   * (not the same as a real `0` — a month that genuinely had zero spend still counts as data). */
  monthly: readonly (MoneyInput | null)[];
  /** Known recurring amount already due next month, added on top of the WMA. */
  recurring: MoneyInput;
}

/** Result of {@link forecastSeries}: the WMA, its spread, and the forecast band. */
export interface ForecastSeriesResult {
  /** Weighted moving average of the available monthly values alone (before `recurring`). */
  wma: Decimal;
  /** Sample standard deviation of the available monthly values alone. */
  stdDev: Decimal;
  /** `wma + recurring`. */
  forecast: Decimal;
  /** `max(0, forecast - stdDev)` — a forecast band should never imply negative spending. */
  lower: Decimal;
  /** `forecast + stdDev`. */
  upper: Decimal;
}

/**
 * Computes a next-month forecast from up to 3 trailing months of data.
 *
 * `FORECAST_WEIGHTS = ['0.5', '0.3', '0.2']` is indexed 0 = M-1 (most recent) .. 2 = M-3 (oldest),
 * but `monthly` is given oldest-first `[M-3, M-2, M-1]` — so the LAST element of `monthly` gets
 * `FORECAST_WEIGHTS[0]` (0.5), the second-to-last gets `FORECAST_WEIGHTS[1]` (0.3), and so on.
 * Getting this backwards silently swaps "most recent" and "oldest" weighting, so the mapping is
 * `monthly[monthly.length - 1 - i]` <-> `FORECAST_WEIGHTS[i]`.
 *
 * Missing (`null`) months are excluded and the remaining weights are renormalised proportionally
 * (e.g. only M-1 and M-2 present -> effective weights `0.5/0.8` and `0.3/0.8`), not just dropped.
 *
 * @param input - The trailing monthly series (oldest-first, `null` for a missing month) and the
 *   known recurring amount for next month.
 * @returns The forecast band, or `null` when fewer than {@link FORECAST_MIN_DATA_MONTHS} of the
 *   3 monthly entries are non-null (insufficient data).
 */
export function forecastSeries(input: ForecastSeriesInput): ForecastSeriesResult | null {
  const { monthly, recurring } = input;
  const n = monthly.length;

  const available: Array<{ value: Decimal; weight: Decimal }> = [];
  for (let i = 0; i < n; i += 1) {
    const value = monthly[i];
    // `i < n` always, so `value` is never actually `undefined` here (noUncheckedIndexedAccess
    // just can't prove it) — `value === null` is the real "month has no data" case.
    if (value === null || value === undefined) continue;
    // monthly[i] is the (n-1-i)-th most recent month; weights are indexed 0 = most recent.
    const weightIndex = n - 1 - i;
    const weight = new Decimal(FORECAST_WEIGHTS[weightIndex] ?? '0');
    available.push({ value: toMoney(value), weight });
  }

  if (available.length < FORECAST_MIN_DATA_MONTHS) return null;

  const weightTotal = available.reduce((total, a) => total.plus(a.weight), new Decimal(0));
  const wma = available.reduce(
    (total, a) => total.plus(a.value.times(a.weight.dividedBy(weightTotal))),
    new Decimal(0),
  );
  const stdDev = sampleStdDev(available.map((a) => a.value));

  const forecast = add(wma, recurring);
  const lower = Decimal.max(0, forecast.minus(stdDev));
  const upper = forecast.plus(stdDev);

  return { wma, stdDev, forecast, lower, upper };
}
