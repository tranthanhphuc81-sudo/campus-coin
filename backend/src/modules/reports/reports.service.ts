/**
 * reports.service.ts
 * Business logic backing `/reports/*` (docs/spec/05b §5.8 Bảng 22): category breakdown,
 * income-vs-expense trend, daily/weekly totals, the monthly PDF export and the email-share flow.
 * Every aggregate is computed with SQL (never summed from raw rows in Node), mirroring
 * `dashboard.service.ts`. Reports covering the still-open current period are cached for
 * {@link REPORT_CURRENT_PERIOD_CACHE_TTL_SEC}; reports covering only already-ended periods for
 * the longer {@link REPORT_ENDED_PERIOD_CACHE_TTL_SEC} (docs/spec/10 §10.3). `cache-invalidator
 * .handler.ts` clears both key families (`reportMonthKey`/`reportRangeKey`) after any transaction
 * change, so a cache miss here simply recomputes.
 * Main exports: categoryBreakdown, incomeVsExpense, dailyWeekly, monthlyExportPdf, shareMonthly,
 *   renderShareEmail, ReportShareJobData, changePct
 * Spec: docs/spec/05b §5.8 · docs/spec/10 §10.2 (SQL aggregation) · §10.3 (cache strategy) ·
 *   docs/security/review-p19.md C-M4 (report-share job payload no longer embeds the rendered PDF)
 */
import { randomUUID } from 'node:crypto';
import {
  REPORT_CURRENT_PERIOD_CACHE_TTL_SEC,
  REPORT_ENDED_PERIOD_CACHE_TTL_SEC,
  REPORT_TOP_TRANSACTIONS_LIMIT,
  TransactionType,
  type ReportCategoryBreakdownDto,
  type ReportCategoryBreakdownItem,
  type ReportCategoryBreakdownQueryInput,
  type ReportDailyItem,
  type ReportDailyWeeklyDto,
  type ReportDailyWeeklyQueryInput,
  type ReportIncomeVsExpenseDto,
  type ReportIncomeVsExpenseMonth,
  type ReportIncomeVsExpenseQueryInput,
  type ReportMonthlyExportQueryInput,
  type ReportShareInput,
  type ReportWeeklyItem,
} from '@campuscoin/shared';
import * as categoriesService from '../categories/categories.service.js';
import * as transactionsService from '../transactions/transactions.service.js';
import { emailTemplates } from '../../i18n/en.js';
import { renderMonthlyReportPdf } from '../../integrations/pdf/monthlyReport.pdf.js';
import type { SendMailInput } from '../../integrations/mailer/transport.js';
import { EMAIL_JOB_NAMES, emailQueue } from '../../jobs/queues.js';
import { record as recordAudit } from '../audit/audit.service.js';
import { cacheGet, cacheSet } from '../../lib/cache.js';
import { reportMonthKey, reportRangeKey } from '../../lib/cacheKeys.js';
import { addDays, daysInMonth, diffInDays, firstDayOfMonth, isoWeek, lastDayOfMonth, todayInTimeZone, type LocalDate } from '../../lib/dates.js';
import { Decimal, formatMoney, percentOf, sub, toMoney, toMoneyString } from '../../lib/money.js';
import { notFound } from '../../lib/problem.js';
import { sha256Hex } from '../../lib/tokens.js';
import { usersRepository } from '../users/users.repository.js';
import { reportsRepository, type CategoryAmountCount } from './reports.repository.js';

/** Rounded % change of `current` vs `previous`; `null` when `previous` has no positive baseline. */
export function changePct(current: Decimal, previous: Decimal): number | null {
  if (!previous.greaterThan(0)) return null;
  return current.minus(previous).dividedBy(previous).times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

/** Loads the caller's account, throwing 404 if it no longer exists (mirrors `dashboard.service.ts`). */
async function requireUser(userId: string) {
  const user = await usersRepository.findById(userId);
  if (!user) throw notFound('Account not found.');
  return user;
}

/** Picks the current-vs-ended TTL for a report whose data range ends on `to` (inclusive), local to `timezone`. */
function ttlForRangeEnding(to: LocalDate, timezone: string): number {
  return to >= todayInTimeZone(timezone) ? REPORT_CURRENT_PERIOD_CACHE_TTL_SEC : REPORT_ENDED_PERIOD_CACHE_TTL_SEC;
}

/**
 * `GET /reports/category-breakdown`: totals per category in `[from, to]`, with each category (and
 * the overall total) compared against the immediately preceding range of the same length.
 */
export async function categoryBreakdown(userId: string, query: ReportCategoryBreakdownQueryInput): Promise<ReportCategoryBreakdownDto> {
  const user = await requireUser(userId);
  const fingerprint = sha256Hex(JSON.stringify({ from: query.from, to: query.to, type: query.type, categoryId: query.categoryId }));
  const cacheKey = reportRangeKey(userId, 'category-breakdown', fingerprint);
  const cached = await cacheGet<ReportCategoryBreakdownDto>(cacheKey);
  if (cached) return cached;

  const rangeLengthDays = diffInDays(query.from, query.to) + 1;
  const previousTo = addDays(query.from, -1);
  const previousFrom = addDays(previousTo, -(rangeLengthDays - 1));
  const filters = { type: query.type, categoryIds: query.categoryId };

  const [currentRows, previousRows, categories] = await Promise.all([
    reportsRepository.byCategoryForRange(userId, query.from, query.to, filters),
    reportsRepository.byCategoryForRange(userId, previousFrom, previousTo, filters),
    categoriesService.list(userId, { includeInactive: true }),
  ]);

  const categoriesById = new Map(categories.map((c) => [c.id, c]));
  const previousByCategory = new Map<number, CategoryAmountCount>(previousRows.map((row) => [row.categoryId, row]));

  const total = currentRows.reduce((acc, row) => acc.plus(row.amount), new Decimal(0));
  const previousTotal = previousRows.reduce((acc, row) => acc.plus(row.amount), new Decimal(0));

  const items: ReportCategoryBreakdownItem[] = currentRows.map((row) => {
    const category = categoriesById.get(row.categoryId);
    const previous = previousByCategory.get(row.categoryId);
    const previousAmount = previous?.amount ?? new Decimal(0);
    return {
      categoryId: row.categoryId,
      name: category?.name ?? '',
      icon: category?.icon ?? null,
      color: category?.color ?? null,
      amount: toMoneyString(row.amount),
      sharePct: percentOf(row.amount, total),
      transactionCount: row.count,
      previousAmount: toMoneyString(previousAmount),
      changePct: changePct(row.amount, previousAmount),
    };
  });

  const dto: ReportCategoryBreakdownDto = {
    from: query.from,
    to: query.to,
    type: query.type ?? null,
    totalAmount: toMoneyString(total),
    totalTransactionCount: currentRows.reduce((acc, row) => acc + row.count, 0),
    previousFrom,
    previousTo,
    previousTotalAmount: toMoneyString(previousTotal),
    changePct: changePct(total, previousTotal),
    items,
  };

  await cacheSet(cacheKey, dto, ttlForRangeEnding(query.to, user.timezone));
  return dto;
}

/** The `count` trailing months ending at `month` (inclusive), oldest first (mirrors `dashboard.service.ts`). */
function trailingMonths(month: LocalDate, count: number): LocalDate[] {
  const months: LocalDate[] = [];
  let cursor = month;
  for (let i = 0; i < count; i += 1) {
    months.unshift(cursor);
    cursor = firstDayOfMonth(addDays(cursor, -1));
  }
  return months;
}

/** `GET /reports/income-vs-expense`: income, expense and net savings per month, oldest first. */
export async function incomeVsExpense(userId: string, query: ReportIncomeVsExpenseQueryInput): Promise<ReportIncomeVsExpenseDto> {
  const user = await requireUser(userId);
  const currentMonth = firstDayOfMonth(todayInTimeZone(user.timezone));
  const cacheKey = reportRangeKey(userId, 'income-vs-expense', `${query.months}:${currentMonth}`);
  const cached = await cacheGet<ReportIncomeVsExpenseDto>(cacheKey);
  if (cached) return cached;

  const months = trailingMonths(currentMonth, query.months);
  const monthRows = await Promise.all(
    months.map(async (month): Promise<ReportIncomeVsExpenseMonth> => {
      const totals = await reportsRepository.totalsForRange(userId, month, lastDayOfMonth(month));
      return { month, income: toMoneyString(totals.income), expense: toMoneyString(totals.expense), net: toMoneyString(sub(totals.income, totals.expense)) };
    }),
  );

  const dto: ReportIncomeVsExpenseDto = { months: monthRows };

  // The window always includes the current (still-open) month, so it is never a purely-ended report.
  await cacheSet(cacheKey, dto, REPORT_CURRENT_PERIOD_CACHE_TTL_SEC);
  return dto;
}

/** Splits `year-month`'s numeric parts out of a `YYYY-MM-DD` first-of-month {@link LocalDate}. */
function yearMonthOf(month: LocalDate): { year: number; month: number } {
  return { year: Number(month.slice(0, 4)), month: Number(month.slice(5, 7)) };
}

/** `GET /reports/daily-weekly`: totals per calendar day and per ISO week within one month. */
export async function dailyWeekly(userId: string, query: ReportDailyWeeklyQueryInput): Promise<ReportDailyWeeklyDto> {
  const user = await requireUser(userId);
  const month = query.month ?? firstDayOfMonth(todayInTimeZone(user.timezone));
  const cacheKey = reportMonthKey(userId, month, 'daily-weekly');
  const cached = await cacheGet<ReportDailyWeeklyDto>(cacheKey);
  if (cached) return cached;

  const monthEnd = lastDayOfMonth(month);
  const rows = await reportsRepository.dailyTotals(userId, month, monthEnd);
  const byDate = new Map(rows.map((row) => [row.date, row]));

  const { year, month: monthNum } = yearMonthOf(month);
  const totalDays = daysInMonth(year, monthNum);
  const daily: ReportDailyItem[] = [];
  for (let day = 1; day <= totalDays; day += 1) {
    const date = `${String(year).padStart(4, '0')}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const found = byDate.get(date);
    daily.push({ date, income: toMoneyString(found?.income ?? new Decimal(0)), expense: toMoneyString(found?.expense ?? new Decimal(0)) });
  }

  interface WeekAccumulator {
    isoYear: number;
    isoWeek: number;
    startDate: LocalDate;
    endDate: LocalDate;
    income: Decimal;
    expense: Decimal;
  }
  const weeklyByKey = new Map<string, WeekAccumulator>();
  for (const item of daily) {
    const { year: isoYear, week: isoWeekNum } = isoWeek(item.date);
    const key = `${isoYear}-${isoWeekNum}`;
    const income = toMoney(item.income);
    const expense = toMoney(item.expense);
    const existing = weeklyByKey.get(key);
    if (existing) {
      existing.income = existing.income.plus(income);
      existing.expense = existing.expense.plus(expense);
      existing.endDate = item.date;
    } else {
      weeklyByKey.set(key, { isoYear, isoWeek: isoWeekNum, startDate: item.date, endDate: item.date, income, expense });
    }
  }
  const weekly: ReportWeeklyItem[] = [...weeklyByKey.values()]
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .map((w) => ({ isoYear: w.isoYear, isoWeek: w.isoWeek, startDate: w.startDate, endDate: w.endDate, income: toMoneyString(w.income), expense: toMoneyString(w.expense) }));

  const today = todayInTimeZone(user.timezone);
  const isCurrentMonth = month === firstDayOfMonth(today);
  const divisor = isCurrentMonth ? Math.max(1, Number(today.slice(8, 10))) : totalDays;
  const totalIncome = daily.reduce((acc, d) => acc.plus(toMoney(d.income)), new Decimal(0));
  const totalExpense = daily.reduce((acc, d) => acc.plus(toMoney(d.expense)), new Decimal(0));

  const dto: ReportDailyWeeklyDto = {
    month,
    daily,
    weekly,
    averageDailyIncome: toMoneyString(totalIncome.dividedBy(divisor)),
    averageDailyExpense: toMoneyString(totalExpense.dividedBy(divisor)),
  };

  await cacheSet(cacheKey, dto, isCurrentMonth ? REPORT_CURRENT_PERIOD_CACHE_TTL_SEC : REPORT_ENDED_PERIOD_CACHE_TTL_SEC);
  return dto;
}

/** Formats a first-of-month {@link LocalDate} as e.g. "September 2026". */
function monthLabel(month: LocalDate): string {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date(`${month}T00:00:00Z`));
}

/** Builds the data the monthly PDF (and, by extension, the email share) renders — never cached itself. */
async function buildMonthlyPdfBuffer(userId: string, month: LocalDate): Promise<Buffer> {
  const user = await requireUser(userId);
  const monthEnd = lastDayOfMonth(month);

  const [totals, categoryRows, categories, topTransactions] = await Promise.all([
    reportsRepository.totalsForRange(userId, month, monthEnd),
    reportsRepository.byCategoryForRange(userId, month, monthEnd, { type: TransactionType.EXPENSE }),
    categoriesService.list(userId, { includeInactive: true }),
    transactionsService.list(userId, {
      from: month,
      to: monthEnd,
      type: undefined,
      categoryId: undefined,
      q: undefined,
      minAmount: undefined,
      maxAmount: undefined,
      sort: '-amount',
      page: 1,
      limit: REPORT_TOP_TRANSACTIONS_LIMIT,
      deleted: false,
    }),
  ]);

  const categoriesById = new Map(categories.map((c) => [c.id, c]));
  const totalExpense = categoryRows.reduce((acc, row) => acc.plus(row.amount), new Decimal(0));

  return renderMonthlyReportPdf({
    monthLabel: monthLabel(month),
    generatedAtDisplay: new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: user.timezone }).format(new Date()),
    incomeDisplay: formatMoney(totals.income, user.currency),
    expenseDisplay: formatMoney(totals.expense, user.currency),
    netDisplay: formatMoney(sub(totals.income, totals.expense), user.currency),
    categoryBreakdown: categoryRows.map((row) => ({
      name: categoriesById.get(row.categoryId)?.name ?? '',
      color: categoriesById.get(row.categoryId)?.color ?? '',
      amountDisplay: formatMoney(row.amount, user.currency),
      sharePct: percentOf(row.amount, totalExpense),
      transactionCount: row.count,
    })),
    topTransactions: topTransactions.data.map((txn) => ({
      dateDisplay: txn.txnDate,
      description: txn.description ?? '—',
      categoryName: txn.category.name,
      typeLabel: txn.type === TransactionType.INCOME ? 'Income' : 'Expense',
      amountDisplay: formatMoney(txn.amount, txn.currency),
    })),
    insightSummary: null, // TODO(p13): include the month's AI insight once P13 ships it.
  });
}

/** `GET /reports/monthly/export?month=&format=pdf`: the rendered PDF + its suggested filename. */
export async function monthlyExportPdf(userId: string, query: ReportMonthlyExportQueryInput): Promise<{ filename: string; buffer: Buffer }> {
  const user = await requireUser(userId);
  const month = query.month ?? firstDayOfMonth(todayInTimeZone(user.timezone));
  const buffer = await buildMonthlyPdfBuffer(userId, month);
  return { filename: `campuscoin-report-${month.slice(0, 7)}.pdf`, buffer };
}

/** Payload queued by {@link shareMonthly} — identifiers/references only, never the rendered PDF/HTML (C-M4). */
export interface ReportShareJobData {
  userId: string;
  month: LocalDate;
  toEmail: string;
  message?: string;
}

/**
 * `POST /reports/monthly/share`: queues a `report-share` job carrying only identifiers/references
 * — never the rendered PDF/HTML (C-M4: a base64 PDF sitting in a BullMQ job's Redis-persisted data
 * for up to 1000 retained jobs risked exhausting Redis memory, shared with sessions/rate-limits/
 * other queues). The PDF is rendered just-in-time by the worker, see {@link renderShareEmail}.
 * Never sends a public link (docs/spec/05b §5.8) — the recipient gets the file itself, nothing
 * else can be reached from it. Rate-limited to 5/day/user at the route (Table 46).
 */
export async function shareMonthly(userId: string, input: ReportShareInput, ctx: { ip?: string; userAgent?: string }): Promise<void> {
  // 404s immediately if the account no longer exists, same as every other report endpoint.
  const user = await requireUser(userId);
  const month = input.month ?? firstDayOfMonth(todayInTimeZone(user.timezone));

  const jobData: ReportShareJobData = { userId, month, toEmail: input.toEmail, message: input.message };
  await emailQueue.add(EMAIL_JOB_NAMES.REPORT_SHARE, jobData, {
    // No ':' in the jobId: installed bullmq (6.3.9) rejects a jobId containing exactly one ':'
    // ("Custom Id cannot contain :" — reserved for its own internal repeatable-job id format,
    // which always has exactly 2). Found via live verification; see PROGRESS.md's P12 entry —
    // several OTHER pre-existing call sites (`auth.service.ts`, `users.service.ts`) build a
    // colon-joined jobId too and would hit the same real (never-mocked-in-tests) failure.
    jobId: `report-share-${randomUUID()}`,
  });

  await recordAudit({
    action: 'report.shared',
    actorId: userId,
    actorRole: 'student',
    entityType: 'report',
    entityId: month,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    metadata: { month, toEmail: input.toEmail },
  });
}

/**
 * Renders the monthly PDF and full email content for a queued `report-share` job. Called only
 * from the `email.send` worker processor (`jobs/processors/email-send.processor.ts`), never at
 * request time — this is what keeps the PDF/HTML out of the job payload persisted in Redis (C-M4).
 * @param data - The job payload queued by {@link shareMonthly}.
 * @throws {ProblemDetailsError} 404 (via `requireUser`) if the sharing account no longer exists by
 *   the time the job runs; BullMQ's retry/failure handling covers this like any other job error.
 */
export async function renderShareEmail(data: ReportShareJobData): Promise<SendMailInput> {
  const user = await requireUser(data.userId);
  const buffer = await buildMonthlyPdfBuffer(data.userId, data.month);
  const template = emailTemplates.reportShare(user.fullName, monthLabel(data.month), data.message);
  return {
    to: data.toEmail,
    subject: template.subject,
    html: template.html,
    text: template.text,
    attachments: [{ filename: `campuscoin-report-${data.month.slice(0, 7)}.pdf`, contentBase64: buffer.toString('base64'), contentType: 'application/pdf' }],
  };
}
