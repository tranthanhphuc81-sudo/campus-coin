/**
 * forecast.ts
 * Zod schema and DTO types for `GET /forecast/next-month` (docs/spec/05c §5.14): per-category and
 * totals next-month spending forecast from a 3-month weighted moving average (WMA) plus known
 * recurring amounts, with a +-1 sample-stdDev band. Numbers are always computed server-side by
 * the pure function in `backend/src/lib/forecast.ts` — this file only shapes the wire contract.
 * Main exports: forecastQuerySchema + inferred type, ForecastBand, ForecastCategoryDto,
 *   ForecastNextMonthDto
 * Spec: docs/spec/05c §5.14
 */
import { z } from 'zod';
import type { TransactionType } from '../enums.js';

/** Query of `GET /forecast/next-month`. No params today; kept for a consistent `validate({query})` call. */
export const forecastQuerySchema = z.object({}).strict();
/** Inferred input type of {@link forecastQuerySchema}. */
export type ForecastQueryInput = z.infer<typeof forecastQuerySchema>;

/** Forecast point estimate plus its +-1 sample-stdDev band; all money strings. */
export interface ForecastBand {
  forecast: string;
  lower: string;
  upper: string;
}

/** One category's next-month forecast. */
export interface ForecastCategoryDto extends ForecastBand {
  categoryId: number;
  name: string;
  icon: string;
  color: string;
  type: TransactionType;
  /**
   * The 3 basis months' totals for this category, oldest-first ([M-3, M-2, M-1]). An entry is the
   * money string `"0.00"`/`"0"` when that month had data but the category's total was genuinely
   * zero, and `null` when that month had no data at all for this category — the frontend chart
   * needs to tell "no data" apart from "really spent nothing".
   */
  history: Array<string | null>;
  /** The weighted moving average alone, before adding `recurring`. */
  wma: string;
  /** Known recurring amount already due next month, added on top of `wma` to get `forecast`. */
  recurring: string;
}

/** Response body of `GET /forecast/next-month`. */
export interface ForecastNextMonthDto {
  /** Target (forecast) month, first-of-month local date, e.g. `"2026-10-01"`. */
  month: string;
  /** The 3 basis months used, oldest-first. */
  basisMonths: string[];
  /** Subset of `basisMonths` that had at least one transaction (any category). */
  availableMonths: string[];
  /** True when fewer than `FORECAST_MIN_DATA_MONTHS` basis months have data — `categories` is `[]`. */
  insufficientData: boolean;
  currency: string;
  totals: { expense: ForecastBand | null; income: ForecastBand | null };
  /** Same 3 basis months' income/expense totals, oldest-first, for the report's history table/chart. */
  history: Array<{ month: string; expense: string; income: string }>;
  /** Per-category forecasts; empty when `insufficientData`. */
  categories: ForecastCategoryDto[];
}
