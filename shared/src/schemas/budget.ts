/**
 * budget.ts
 * Zod schemas and DTO types for monthly per-category budgets and their real-time consumption
 * vs actual spend (green <80% / amber 80–99% / red ≥100%, dashboard-fixed thresholds separate
 * from each budget's own customisable alert threshold).
 * Main exports: budgetUpsertItemSchema, upsertBudgetsSchema, copyPreviousBudgetsSchema,
 *   listBudgetsQuerySchema + inferred *Input types, BudgetStatus, BudgetDto
 * Spec: docs/spec/05c §5.11 (budgets & alerts) · docs/spec/07 §7.3.3
 */
import { z } from 'zod';
import {
  BUDGET_ALERT_THRESHOLD_DEFAULT,
  BUDGET_ALERT_THRESHOLD_MAX,
  BUDGET_ALERT_THRESHOLD_MIN,
  BUDGET_BULK_UPSERT_MAX,
  BUDGET_MONTH_RANGE_YEARS,
} from '../constants.js';
import { localDateSchema, moneyStringSchema } from './common.js';

/** True when `value` (already a real `YYYY-MM-DD` date per {@link localDateSchema}) falls within
 * {@link BUDGET_MONTH_RANGE_YEARS} years of today, in either direction. */
function isWithinBudgetMonthRange(value: string): boolean {
  const year = Number(value.slice(0, 4));
  const nowYear = new Date().getUTCFullYear();
  return year >= nowYear - BUDGET_MONTH_RANGE_YEARS && year <= nowYear + BUDGET_MONTH_RANGE_YEARS;
}

/**
 * A budget `month`: a real calendar date that is also the FIRST day of its month (B-M2/CLAUDE.md:
 * "month = first day of month" — a mid-month value would silently never be found by the
 * budget-alert handler's first-of-month lookup, so alerts for it would never fire), bounded to
 * within {@link BUDGET_MONTH_RANGE_YEARS} years of today (bounds the otherwise-unlimited number of
 * budget rows a user could create: finite months × {@link BUDGET_BULK_UPSERT_MAX} categories/call).
 */
export const budgetMonthSchema = localDateSchema
  .refine((v) => v.endsWith('-01'), 'month must be the first day of the month.')
  .refine(isWithinBudgetMonthRange, `month must be within ${BUDGET_MONTH_RANGE_YEARS} years of today.`);
/** Inferred type of {@link budgetMonthSchema}. */
export type BudgetMonthInput = z.infer<typeof budgetMonthSchema>;

/** Traffic-light consumption status of a budget vs its limit (docs/spec/05b §5.7 Bảng 21). */
export const BudgetStatus = {
  GREEN: 'green',
  AMBER: 'amber',
  RED: 'red',
} as const;
/** Union of {@link BudgetStatus} values. */
export type BudgetStatus = (typeof BudgetStatus)[keyof typeof BudgetStatus];

/** One category's limit inside a bulk `PUT /budgets` upsert. */
export const budgetUpsertItemSchema = z
  .object({
    categoryId: z.number().int().positive(),
    limitAmount: moneyStringSchema,
    alertThresholdPct: z
      .number()
      .int()
      .min(BUDGET_ALERT_THRESHOLD_MIN, `Threshold must be at least ${BUDGET_ALERT_THRESHOLD_MIN}.`)
      .max(BUDGET_ALERT_THRESHOLD_MAX, `Threshold must be at most ${BUDGET_ALERT_THRESHOLD_MAX}.`)
      .default(BUDGET_ALERT_THRESHOLD_DEFAULT),
  })
  .strict();
/** Inferred input type of {@link budgetUpsertItemSchema}. */
export type BudgetUpsertItemInput = z.infer<typeof budgetUpsertItemSchema>;

/** Body of `PUT /budgets` — create/update every expense category's budget for one month at once. */
export const upsertBudgetsSchema = z
  .object({
    month: budgetMonthSchema,
    budgets: z.array(budgetUpsertItemSchema).min(1).max(BUDGET_BULK_UPSERT_MAX),
  })
  .strict();
/** Inferred input type of {@link upsertBudgetsSchema}. */
export type UpsertBudgetsInput = z.infer<typeof upsertBudgetsSchema>;

/** Body of `POST /budgets/copy-previous` — copy the prior month's budgets into `month`. */
export const copyPreviousBudgetsSchema = z.object({ month: budgetMonthSchema }).strict();
/** Inferred input type of {@link copyPreviousBudgetsSchema}. */
export type CopyPreviousBudgetsInput = z.infer<typeof copyPreviousBudgetsSchema>;

/** Query of `GET /budgets?month=`. Omitted `month` means the caller's current month. */
export const listBudgetsQuerySchema = z.object({ month: budgetMonthSchema.optional() }).strict();
/** Inferred input type of {@link listBudgetsQuerySchema}. */
export type ListBudgetsQueryInput = z.infer<typeof listBudgetsQuerySchema>;

/** Shape of a budget with its computed consumption, as returned by the API. */
export interface BudgetDto {
  id: number;
  categoryId: number;
  category: { id: number; name: string; icon: string | null; color: string | null };
  month: string;
  limitAmount: string;
  alertThresholdPct: number;
  spent: string;
  percent: number;
  status: BudgetStatus;
  createdAt: string;
  updatedAt: string;
}
