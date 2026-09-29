/**
 * forecast.service.ts
 * Business logic for `GET /forecast/next-month` (docs/spec/05c §5.14): gathers the 3 most recent
 * COMPLETE months as the WMA basis, adds each category's known recurring amount already due next
 * month, and hands both to the pure `forecastSeries` (`lib/forecast.ts`) per category and again for
 * the overall expense/income totals. All money is rounded to a string only at the DTO boundary.
 * Main exports: nextMonth
 * Spec: docs/spec/05c §5.14
 */
import {
  FORECAST_BASIS_MONTHS,
  FORECAST_MIN_DATA_MONTHS,
  TransactionType,
  type ForecastBand,
  type ForecastCategoryDto,
  type ForecastNextMonthDto,
} from '@campuscoin/shared';
import * as recurringService from '../recurring/recurring.service.js';
import * as categoriesService from '../categories/categories.service.js';
import { addDays, firstDayOfMonth, lastDayOfMonth, todayInTimeZone, trailingMonths, type LocalDate } from '../../lib/dates.js';
import { forecastSeries } from '../../lib/forecast.js';
import { Decimal, compare, toMoney, toMoneyString } from '../../lib/money.js';
import { notFound } from '../../lib/problem.js';
import { countOccurrencesInRange, ruleToSpec } from '../../lib/recurrence.js';
import { usersRepository } from '../users/users.repository.js';
import { forecastRepository, type MonthlyCategoryTotal } from './forecast.repository.js';

/** One basis month's loaded data: its raw per-category totals, and whether it had any data at all. */
interface BasisMonthData {
  month: LocalDate;
  hasData: boolean;
  totals: MonthlyCategoryTotal[];
}

/** One category+type's assembled inputs before calling `forecastSeries` (history + recurring). */
interface CategoryCandidate {
  categoryId: number;
  type: TransactionType;
  /** Oldest-first, exactly {@link FORECAST_BASIS_MONTHS} entries. */
  monthly: Array<string | null>;
  recurring: Decimal;
}

/** Sums `totals` for one type only (used for both `history` and the summed totals series). */
function sumByType(totals: MonthlyCategoryTotal[], type: TransactionType): Decimal {
  return totals.filter((t) => t.type === type).reduce((acc, t) => acc.plus(t.amount), new Decimal(0));
}

/** The response's top-level actuals-only `history`: summed income/expense per basis month. */
function buildHistory(basisData: BasisMonthData[]): Array<{ month: LocalDate; expense: string; income: string }> {
  return basisData.map((d) => ({
    month: d.month,
    expense: toMoneyString(sumByType(d.totals, TransactionType.EXPENSE)),
    income: toMoneyString(sumByType(d.totals, TransactionType.INCOME)),
  }));
}

/** Composite map key shared by the candidate map and the recurring-amount map. */
function candidateKey(categoryId: number, type: TransactionType): string {
  return `${categoryId}:${type}`;
}

/**
 * Known recurring amount already due next month, per category+type: for every active rule
 * overlapping the target month, multiplies its amount by how many times it will actually fire in
 * that window (a monthly/yearly rule fires 0 or 1 times; a weekly rule can fire more than once).
 */
async function buildRecurringByCategory(userId: string, target: LocalDate): Promise<Map<string, Decimal>> {
  const monthEnd = lastDayOfMonth(target);
  const rules = await recurringService.listActiveForRange(userId, target, monthEnd);
  const map = new Map<string, Decimal>();
  for (const rule of rules) {
    const occurrences = countOccurrencesInRange(ruleToSpec(rule), target, monthEnd);
    if (occurrences === 0) continue;
    const key = candidateKey(rule.categoryId, rule.type as TransactionType);
    const amount = toMoney(rule.amount).times(occurrences);
    map.set(key, (map.get(key) ?? new Decimal(0)).plus(amount));
  }
  return map;
}

/**
 * Builds one candidate per category+type that appears in ANY basis month's totals OR has a
 * recurring amount. `monthly[i]` is `null` only when basis month `i` had NO data at all for the
 * user (per {@link BasisMonthData.hasData}) — a month that had other data but genuinely zero for
 * this category+type is the real string `"0.00"`, never `null` (this distinction is the whole
 * point of the DTO's `history` field).
 */
function buildCategoryCandidates(basisData: BasisMonthData[], recurringByCategory: Map<string, Decimal>): CategoryCandidate[] {
  const map = new Map<string, CategoryCandidate>();

  basisData.forEach((month, index) => {
    for (const row of month.totals) {
      const key = candidateKey(row.categoryId, row.type);
      const candidate = map.get(key) ?? { categoryId: row.categoryId, type: row.type, monthly: basisData.map(() => null), recurring: new Decimal(0) };
      candidate.monthly[index] = toMoneyString(row.amount);
      map.set(key, candidate);
    }
  });

  for (const [key, recurringAmount] of recurringByCategory) {
    const [categoryIdText, type] = key.split(':') as [string, TransactionType];
    const candidate = map.get(key) ?? { categoryId: Number(categoryIdText), type, monthly: basisData.map(() => null), recurring: new Decimal(0) };
    candidate.recurring = recurringAmount;
    map.set(key, candidate);
  }

  for (const candidate of map.values()) {
    basisData.forEach((month, index) => {
      if (candidate.monthly[index] === null && month.hasData) candidate.monthly[index] = toMoneyString(new Decimal(0));
    });
  }

  return [...map.values()];
}

/**
 * Maps one candidate into its public DTO, calling the pure `forecastSeries`. A recurring-only
 * candidate can have fewer non-null months than `forecastSeries`'s own {@link FORECAST_MIN_DATA_MONTHS}
 * threshold requires (that function has no idea a `recurring` amount exists) — in that case this
 * synthesises the same "zero history + recurring" shape a sufficient-history all-zero series would
 * produce (`wma`/`stdDev` 0, `forecast` = `recurring`), rather than dropping the category.
 */
function toCategoryDto(candidate: CategoryCandidate, category: { name: string; icon: string | null; color: string | null } | undefined): ForecastCategoryDto {
  const series = forecastSeries({ monthly: candidate.monthly, recurring: candidate.recurring }) ?? {
    wma: new Decimal(0),
    stdDev: new Decimal(0),
    forecast: candidate.recurring,
    lower: candidate.recurring,
    upper: candidate.recurring,
  };

  return {
    categoryId: candidate.categoryId,
    name: category?.name ?? '',
    icon: category?.icon ?? '',
    color: category?.color ?? '',
    type: candidate.type,
    history: candidate.monthly,
    wma: toMoneyString(series.wma),
    recurring: toMoneyString(candidate.recurring),
    forecast: toMoneyString(series.forecast),
    lower: toMoneyString(series.lower),
    upper: toMoneyString(series.upper),
  };
}

/**
 * Every category+type candidate worth surfacing (step 7 of the design): included when it has
 * either enough real history on its own, or a nonzero recurring amount to fall back on. Sorted by
 * `forecast` descending.
 */
async function buildCategoryDtos(userId: string, candidates: CategoryCandidate[]): Promise<ForecastCategoryDto[]> {
  const categories = await categoriesService.list(userId, { includeInactive: true });
  const categoriesById = new Map(categories.map((c) => [c.id, c]));

  // In practice this non-null-count filter rarely excludes anything ONCE the overall
  // `insufficientData` gate has passed: the zero-fill step above gives every candidate exactly
  // `availableMonths.length` non-null entries, which is already >= FORECAST_MIN_DATA_MONTHS. A
  // candidate only ends up excluded here when it never had any real history AND its recurring
  // amount happens to be exactly 0 (e.g. an active rule that computes 0 occurrences next month) —
  // kept as an explicit, documented safety net rather than assumed unreachable.
  const dtos = candidates
    .filter((c) => c.monthly.filter((m) => m !== null).length >= FORECAST_MIN_DATA_MONTHS || c.recurring.greaterThan(0))
    .map((c) => toCategoryDto(c, categoriesById.get(c.categoryId)));

  dtos.sort((a, b) => compare(b.forecast, a.forecast));
  return dtos;
}

/** One basis month's summed (all categories) monthly series for one type — feeds the totals band. */
function buildTypeSeries(basisData: BasisMonthData[], type: TransactionType): Array<string | null> {
  return basisData.map((d) => (d.hasData ? toMoneyString(sumByType(d.totals, type)) : null));
}

/** Sums every recurring amount of one type across categories (for the totals band). */
function sumRecurringByType(recurringByCategory: Map<string, Decimal>, type: TransactionType): Decimal {
  let total = new Decimal(0);
  for (const [key, amount] of recurringByCategory) {
    if (key.endsWith(`:${type}`)) total = total.plus(amount);
  }
  return total;
}

/**
 * One type's (expense/income) forecast band, recomputed on the SUMMED monthly series (step 9) so
 * `totals` stays mathematically consistent with `categories` — the WMA is a linear weighted sum, so
 * summing per-category forecasts would give the same number anyway, but recomputing avoids drift if
 * that ever stops being true. `null` when the type's OWN summed series has fewer than
 * {@link FORECAST_MIN_DATA_MONTHS} non-null months — today this can only differ from the overall
 * `insufficientData` gate if month availability ever becomes type-specific; kept as an explicit,
 * documented judgment call rather than assuming it can never happen.
 */
function buildTotalBand(basisData: BasisMonthData[], recurringByCategory: Map<string, Decimal>, type: TransactionType): ForecastBand | null {
  const monthly = buildTypeSeries(basisData, type);
  const recurring = sumRecurringByType(recurringByCategory, type);
  const result = forecastSeries({ monthly, recurring });
  if (!result) return null;
  return { forecast: toMoneyString(result.forecast), lower: toMoneyString(result.lower), upper: toMoneyString(result.upper) };
}

/**
 * `GET /forecast/next-month`: per-category and overall next-month spending/income forecast from a
 * 3-month weighted moving average plus known recurring amounts.
 * @param userId - Caller (from the verified token).
 * @throws {AppError} 404 when the account no longer exists.
 */
export async function nextMonth(userId: string): Promise<ForecastNextMonthDto> {
  const user = await usersRepository.findById(userId);
  if (!user) throw notFound('Account not found.');

  const today = todayInTimeZone(user.timezone);
  const currentMonthStart = firstDayOfMonth(today);
  const target = firstDayOfMonth(addDays(lastDayOfMonth(currentMonthStart), 1));
  // The 3 most recent COMPLETE months — trailingMonths is inclusive of the month containing its
  // `date` argument, so anchoring on the day before the current month excludes the current
  // (still-open, partial) month from the basis.
  const basisMonths = trailingMonths(addDays(currentMonthStart, -1), FORECAST_BASIS_MONTHS);

  const basisData: BasisMonthData[] = await Promise.all(
    basisMonths.map(async (month): Promise<BasisMonthData> => {
      const monthEnd = lastDayOfMonth(month);
      const [totals, hasData] = await Promise.all([
        forecastRepository.monthlyTotalsByCategory(userId, month, monthEnd),
        forecastRepository.hasAnyTransactionInMonth(userId, month, monthEnd),
      ]);
      return { month, hasData, totals };
    }),
  );

  const availableMonths = basisData.filter((d) => d.hasData).map((d) => d.month);
  const history = buildHistory(basisData);

  if (availableMonths.length < FORECAST_MIN_DATA_MONTHS) {
    return {
      month: target,
      basisMonths,
      availableMonths,
      insufficientData: true,
      currency: user.currency,
      totals: { expense: null, income: null },
      history,
      categories: [],
    };
  }

  const recurringByCategory = await buildRecurringByCategory(userId, target);
  const candidates = buildCategoryCandidates(basisData, recurringByCategory);
  const categories = await buildCategoryDtos(userId, candidates);

  return {
    month: target,
    basisMonths,
    availableMonths,
    insufficientData: false,
    currency: user.currency,
    totals: {
      expense: buildTotalBand(basisData, recurringByCategory, TransactionType.EXPENSE),
      income: buildTotalBand(basisData, recurringByCategory, TransactionType.INCOME),
    },
    history,
    categories,
  };
}
