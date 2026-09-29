/**
 * report.ts
 * Zod schemas and DTO types for `/reports/*` (docs/spec/05b §5.8 Bảng 22): category breakdown,
 * income-vs-expense trend, daily/weekly totals, and the monthly PDF export + email-share bodies.
 * Every money field is a decimal string (never a JS float); every date is a local `YYYY-MM-DD`.
 * Main exports: reportCategoryBreakdownQuerySchema, reportIncomeVsExpenseQuerySchema,
 *   reportDailyWeeklyQuerySchema, reportMonthlyExportQuerySchema, reportShareSchema
 *   + inferred *Input types, ReportCategoryBreakdownDto, ReportIncomeVsExpenseDto,
 *   ReportDailyWeeklyDto
 * Spec: docs/spec/05b §5.8 · docs/spec/07 §7.3.3 · Table 46 (rate limits) ·
 *   docs/security/review-p19.md C-L4/B-L7 (share `message` control-char/URL rejection)
 */
import { z } from 'zod';
import { TransactionType } from '../enums.js';
import { CATEGORY_FILTER_MAX_IDS, REPORT_INCOME_VS_EXPENSE_MONTHS_DEFAULT, REPORT_INCOME_VS_EXPENSE_MONTHS_MAX, REPORT_SHARE_MESSAGE_MAX_CHARS } from '../constants.js';
import { emailSchema } from './auth.js';
import { localDateSchema } from './common.js';

// C-L4/B-L7: the shared-report email is sent from CampusCoin's own trusted domain to an arbitrary
// address the sender typed in — a phishing vector if the free-text `message` can carry a URL (mail
// clients auto-link it) or control characters (fake paragraph breaks in the plaintext body).
// See docs/security/review-p19.md.
// eslint-disable-next-line no-control-regex -- intentional: this IS the control-char filter.
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;
// Same URL-detection shape used elsewhere for consistency (integrations/ai/sanitize.ts's
// URL_PATTERN, integrations/ai/prompts/insight.v1.ts's output check): no bounded/backtracking risk.
const URL_LIKE = /https?:\/\/\S+|www\.\S+/i;

// CATEGORY_FILTER_MAX_IDS is a fixed internal constant, never client input, so this is not a
// ReDoS-relevant dynamic-regex construction.
// eslint-disable-next-line security/detect-non-literal-regexp
const CATEGORY_ID_LIST = new RegExp(`^\\d{1,10}(,\\d{1,10}){0,${CATEGORY_FILTER_MAX_IDS - 1}}$`);

/** Query of `GET /reports/category-breakdown?from&to&type&categoryId`. */
export const reportCategoryBreakdownQuerySchema = z
  .object({
    from: localDateSchema,
    to: localDateSchema,
    type: z.enum(TransactionType).optional(),
    categoryId: z
      .string()
      .regex(CATEGORY_ID_LIST, `Provide up to ${CATEGORY_FILTER_MAX_IDS} comma-separated category ids.`)
      .transform((v) => v.split(',').map(Number))
      .optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.from > v.to) ctx.addIssue({ code: 'custom', path: ['to'], message: 'to must not be before from.' });
  });
/** Inferred input type of {@link reportCategoryBreakdownQuerySchema}. */
export type ReportCategoryBreakdownQueryInput = z.infer<typeof reportCategoryBreakdownQuerySchema>;

/** One category's totals within the requested range, compared to the immediately preceding range of the same length. */
export interface ReportCategoryBreakdownItem {
  categoryId: number;
  name: string;
  icon: string | null;
  color: string | null;
  amount: string;
  sharePct: number;
  transactionCount: number;
  previousAmount: string;
  /** `null` when the previous range has no data for this category to compare against. */
  changePct: number | null;
}

/** Response of `GET /reports/category-breakdown`. */
export interface ReportCategoryBreakdownDto {
  from: string;
  to: string;
  type: TransactionType | null;
  totalAmount: string;
  totalTransactionCount: number;
  previousFrom: string;
  previousTo: string;
  previousTotalAmount: string;
  /** `null` when the previous range has no data to compare against. */
  changePct: number | null;
  items: ReportCategoryBreakdownItem[];
}

/** Query of `GET /reports/income-vs-expense?months=`. */
export const reportIncomeVsExpenseQuerySchema = z
  .object({
    months: z.coerce.number().int().min(1).max(REPORT_INCOME_VS_EXPENSE_MONTHS_MAX).default(REPORT_INCOME_VS_EXPENSE_MONTHS_DEFAULT),
  })
  .strict();
/** Inferred input type of {@link reportIncomeVsExpenseQuerySchema}. */
export type ReportIncomeVsExpenseQueryInput = z.infer<typeof reportIncomeVsExpenseQuerySchema>;

/** One month's totals; a month with no transactions at all still appears, with `"0.00"` amounts. */
export interface ReportIncomeVsExpenseMonth {
  /** First day of the month, `YYYY-MM-DD`. */
  month: string;
  income: string;
  expense: string;
  net: string;
}

/** Response of `GET /reports/income-vs-expense`, oldest month first. */
export interface ReportIncomeVsExpenseDto {
  months: ReportIncomeVsExpenseMonth[];
}

/** Query of `GET /reports/daily-weekly?month=`. Omitted `month` means the caller's current month. */
export const reportDailyWeeklyQuerySchema = z.object({ month: localDateSchema.optional() }).strict();
/** Inferred input type of {@link reportDailyWeeklyQuerySchema}. */
export type ReportDailyWeeklyQueryInput = z.infer<typeof reportDailyWeeklyQuerySchema>;

/** One calendar day's totals within the requested month. */
export interface ReportDailyItem {
  /** `YYYY-MM-DD`. */
  date: string;
  income: string;
  expense: string;
}

/** One ISO week's totals within the requested month (a week spanning two months is split at the month boundary). */
export interface ReportWeeklyItem {
  isoYear: number;
  isoWeek: number;
  /** `YYYY-MM-DD` of the first day of this week that falls inside the requested month. */
  startDate: string;
  /** `YYYY-MM-DD` of the last day of this week that falls inside the requested month. */
  endDate: string;
  income: string;
  expense: string;
}

/** Response of `GET /reports/daily-weekly`. */
export interface ReportDailyWeeklyDto {
  month: string;
  daily: ReportDailyItem[];
  weekly: ReportWeeklyItem[];
  averageDailyIncome: string;
  averageDailyExpense: string;
}

/** Query of `GET /reports/monthly/export?month=&format=pdf`. Omitted `month` means the caller's current month. */
export const reportMonthlyExportQuerySchema = z
  .object({ month: localDateSchema.optional(), format: z.literal('pdf').default('pdf') })
  .strict();
/** Inferred input type of {@link reportMonthlyExportQuerySchema}. */
export type ReportMonthlyExportQueryInput = z.infer<typeof reportMonthlyExportQuerySchema>;

/** Body of `POST /reports/monthly/share`. Omitted `month` means the caller's current month. */
export const reportShareSchema = z
  .object({
    month: localDateSchema.optional(),
    toEmail: emailSchema,
    message: z
      .string()
      .trim()
      .max(REPORT_SHARE_MESSAGE_MAX_CHARS, `Message must be at most ${REPORT_SHARE_MESSAGE_MAX_CHARS} characters.`)
      .refine((v) => !CONTROL_CHARS.test(v), 'Message must not contain control characters.')
      .refine((v) => !URL_LIKE.test(v), 'Message must not contain a link.')
      .optional(),
  })
  .strict();
/** Inferred input type of {@link reportShareSchema}. */
export type ReportShareInput = z.infer<typeof reportShareSchema>;
