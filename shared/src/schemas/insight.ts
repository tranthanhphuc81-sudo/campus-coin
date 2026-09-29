/**
 * insight.ts
 * Zod schemas and DTO types for the monthly AI/template insight feature (docs/spec/05b §5.9):
 * `GET /insights`, `GET /insights/:month`, `POST /insights/:month/regenerate`. The backend always
 * computes the numbers; the LLM (when enabled) only writes prose around them — `flaggedPatterns`
 * carries those numbers so the client can render "+40%" chips without re-deriving anything.
 * Main exports: listInsightsQuerySchema, insightMonthParamSchema + inferred *Input types,
 *   InsightFlaggedPattern, InsightDto, InsightListResponse
 * Spec: docs/spec/05b §5.9 · docs/spec/07 §7.3.3 (insights routes)
 */
import { z } from 'zod';
import type { InsightGenerator, InsightStatus } from '../enums.js';
import { PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX } from '../constants.js';
import { localDateSchema } from './common.js';

/** Query of `GET /insights` (history, newest month first). */
export const listInsightsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(PAGE_SIZE_DEFAULT),
  })
  .strict();
/** Inferred input type of {@link listInsightsQuerySchema}. */
export type ListInsightsQueryInput = z.infer<typeof listInsightsQuerySchema>;

/** Route param of `GET /insights/:month` and `POST /insights/:month/regenerate` — any date within
 * the target month; the server normalises it to the month's first day. */
export const insightMonthParamSchema = z.object({ month: localDateSchema }).strict();
/** Inferred input type of {@link insightMonthParamSchema}. */
export type InsightMonthParamInput = z.infer<typeof insightMonthParamSchema>;

/** One detected spending pattern surfaced by an insight (docs/spec/05b §5.9.1 steps 2-4). Only the
 * fields relevant to `kind` are non-null. */
export interface InsightFlaggedPattern {
  kind: 'growth' | 'budget_exceeded' | 'new_category' | 'largest_expense';
  categoryId: number | null;
  categoryName: string | null;
  /** Decimal string; the category's spend this month (growth/budget_exceeded/new_category), or the
   * single transaction's amount (largest_expense). */
  amount: string | null;
  /** Decimal string; avg3(c) — present only for `kind: 'growth'`. */
  avg3: string | null;
  /** Whole-percent growth vs avg3 — present only for `kind: 'growth'`. */
  growthPct: number | null;
  /** Suggested weekly spending cap (`round(avg3/4.33)`) — present only for `kind: 'growth'`. */
  weeklyCap: string | null;
}

/** One month's insight, as returned by the API. `flaggedPatterns` is `[]` while `status` is
 * `queued`/`processing`, or when the month had too few transactions to analyse. */
export interface InsightDto {
  id: number;
  /** First day of the analysed month, `YYYY-MM-DD`. */
  month: string;
  summaryText: string | null;
  tipText: string | null;
  flaggedPatterns: InsightFlaggedPattern[];
  /** Whole-percent `(income-expense)/income` for the month; `null` when income is 0. */
  savingsRatePct: number | null;
  generator: InsightGenerator | null;
  status: InsightStatus;
  regenerateCount: number;
  /** `INSIGHT_MAX_REGENERATE_PER_MONTH - regenerateCount`, clamped to >= 0. */
  regenerateRemaining: number;
  generatedAt: string | null;
  createdAt: string;
}

/** Response body of `GET /insights`. */
export interface InsightListResponse {
  data: InsightDto[];
  page: number;
  limit: number;
  total: number;
}
