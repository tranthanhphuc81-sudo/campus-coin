/**
 * insights.stats.ts
 * Pure spending-pattern detection for the monthly insights engine (docs/spec/05b §5.9.1) — no DB
 * access, no I/O. The repository builds the raw Decimal inputs; this module turns them into the
 * ranked `flaggedPatterns` + `savingsRatePct` snapshot that both the LLM prompt and the template
 * fallback are built from. Money math always goes through `Decimal`, never a JS float.
 * Main exports: avg3, growthPct, isGrowthFlagged, weeklyCap, savingsRatePct, buildInsightSnapshot,
 *   toInsightStatsForPrompt, CategoryStatsInput, InsightStatsInput
 * Spec: docs/spec/05b §5.9.1 (pattern detection algorithm)
 */
import {
  INSIGHT_AVG_MIN_MONTHS,
  INSIGHT_GROWTH_ABS_FLOOR,
  INSIGHT_GROWTH_ALLOWANCE_PCT,
  INSIGHT_GROWTH_FLAG_RATIO,
  INSIGHT_MAX_FLAGGED_PATTERNS,
  INSIGHT_WEEKLY_CAP_DIVISOR,
  type CurrencyCode,
  type InsightFlaggedPattern,
} from '@campuscoin/shared';
import type { InsightStats, InsightStatsFlaggedPattern } from '../../integrations/ai/types.js';
import type { LocalDate } from '../../lib/dates.js';
import { average, Decimal, toMoneyString } from '../../lib/money.js';

/** One expense category's this-month total, its 3 trailing-month totals, and its budget (if any). */
export interface CategoryStatsInput {
  categoryId: number;
  categoryName: string;
  /** This month's total spend (Decimal, already summed by the repository). */
  cur: Decimal;
  /** `[M-1, M-2, M-3]` totals, oldest-last; `null` = genuinely no transactions that category+month
   * (not "spent 0"). */
  priorMonths: (Decimal | null)[];
  /** This category's budget limit for the month, if one was set. */
  budgetLimit: Decimal | null;
}

/** Everything {@link buildInsightSnapshot} needs for one user+month (repository-built, pure input). */
export interface InsightStatsInput {
  month: LocalDate; // first day
  currency: string; // 'USD' | 'VND'
  allowanceBaseline: Decimal | null; // user.monthlyAllowanceBaseline
  totalIncome: Decimal;
  totalExpense: Decimal;
  // BR (documented judgment call, per the phase prompt's "you decide"): only categories with
  // `cur > 0` this month are evaluated — a category with only prior-month history and zero spend
  // this month cannot be "growing", "over budget" or "new" this month, so it contributes nothing
  // to any of the 3 flag kinds. Matches `insights.repository.ts`'s own simplification.
  categories: CategoryStatsInput[];
  /** Biggest single expense txn this month, or `null` if none. */
  largestExpense: { categoryName: string; amount: Decimal } | null;
  /** True if the user has ANY expense transaction in any of the 3 prior months (any category) —
   * gates `new_category` so a brand-new account with <1 month of history is never flooded with
   * "new category" flags for every category it happens to spend in this month. */
  hasAnyPriorMonthHistory: boolean;
}

/**
 * Average of the non-null entries in `priorMonths`.
 * @returns The Decimal average, or `null` when fewer than {@link INSIGHT_AVG_MIN_MONTHS} are non-null.
 */
export function avg3(priorMonths: readonly (Decimal | null)[]): Decimal | null {
  const nonNull = priorMonths.filter((v): v is Decimal => v !== null);
  if (nonNull.length < INSIGHT_AVG_MIN_MONTHS) return null;
  return average(nonNull);
}

/**
 * Whole-percent (1 decimal) growth of `cur` vs `avg`: `((cur-avg)/avg)*100`.
 * @param avg - Must be > 0 (callers only call this once {@link isGrowthFlagged} has passed).
 */
export function growthPct(cur: Decimal, avg: Decimal): number {
  return cur.minus(avg).dividedBy(avg).times(100).toDecimalPlaces(1, Decimal.ROUND_HALF_UP).toNumber();
}

/**
 * BR (§5.9.1): a category's spend "grew" when it is at least {@link INSIGHT_GROWTH_FLAG_RATIO}
 * above its 3-month average AND the absolute deviation clears a noise floor (the larger of a flat
 * per-currency floor and a % of the user's allowance baseline) — small/no-baseline users never get
 * flagged for a $1 swing that happens to be a big ratio.
 */
export function isGrowthFlagged(cur: Decimal, avg: Decimal, currency: string, allowanceBaseline: Decimal | null): boolean {
  const ratio = cur.minus(avg).dividedBy(avg);
  if (ratio.lessThan(INSIGHT_GROWTH_FLAG_RATIO)) return false;

  const flatFloor = new Decimal(INSIGHT_GROWTH_ABS_FLOOR[currency as CurrencyCode] ?? INSIGHT_GROWTH_ABS_FLOOR.USD);
  const allowanceFloor = allowanceBaseline ? allowanceBaseline.times(INSIGHT_GROWTH_ALLOWANCE_PCT).dividedBy(100) : new Decimal(0);
  const floor = Decimal.max(flatFloor, allowanceFloor);
  return cur.minus(avg).abs().greaterThanOrEqualTo(floor);
}

/** Suggested weekly spending cap for the rest of the month: `round(avg / 4.33, 2dp)`. */
export function weeklyCap(avg: Decimal): Decimal {
  return avg.dividedBy(INSIGHT_WEEKLY_CAP_DIVISOR).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/**
 * Whole-percent (1 decimal) savings rate for the month: `(income-expense)/income*100`.
 * @returns `null` when `income <= 0` (no meaningful rate).
 */
export function savingsRatePct(income: Decimal, expense: Decimal): number | null {
  if (!income.greaterThan(0)) return null;
  return income.minus(expense).dividedBy(income).times(100).toDecimalPlaces(1, Decimal.ROUND_HALF_UP).toNumber();
}

/** A candidate flagged pattern plus its internal ranking key — `severity` never leaves this module. */
interface RankedPattern {
  pattern: InsightFlaggedPattern;
  severity: Decimal;
}

/**
 * Runs the §5.9.1 detection algorithm for one category: growth (step 1) and budget-exceeded (step
 * 2) are independent — a category can produce both in the same run.
 */
function detectCategoryPatterns(category: CategoryStatsInput, currency: string, allowanceBaseline: Decimal | null): RankedPattern[] {
  const results: RankedPattern[] = [];
  const avg = avg3(category.priorMonths);

  if (avg !== null && isGrowthFlagged(category.cur, avg, currency, allowanceBaseline)) {
    results.push({
      pattern: {
        kind: 'growth',
        categoryId: category.categoryId,
        categoryName: category.categoryName,
        amount: toMoneyString(category.cur),
        avg3: toMoneyString(avg),
        growthPct: growthPct(category.cur, avg),
        weeklyCap: toMoneyString(weeklyCap(avg)),
      },
      severity: category.cur.minus(avg).abs(),
    });
  }

  if (category.budgetLimit !== null && category.cur.greaterThan(category.budgetLimit)) {
    results.push({
      pattern: {
        kind: 'budget_exceeded',
        categoryId: category.categoryId,
        categoryName: category.categoryName,
        amount: toMoneyString(category.cur),
        avg3: null,
        growthPct: null,
        weeklyCap: null,
      },
      severity: category.cur.minus(category.budgetLimit),
    });
  }

  return results;
}

/**
 * Detects `new_category` (step 3): a category with zero prior-month history (all 3 months null)
 * that has spend this month — but only once the user has SOME expense history overall (gates a
 * brand-new account, see {@link InsightStatsInput.hasAnyPriorMonthHistory}'s doc comment).
 */
function detectNewCategory(category: CategoryStatsInput, hasAnyPriorMonthHistory: boolean): RankedPattern | null {
  if (!hasAnyPriorMonthHistory) return null;
  if (!category.cur.greaterThan(0)) return null;
  if (category.priorMonths.some((v) => v !== null)) return null;

  return {
    pattern: {
      kind: 'new_category',
      categoryId: category.categoryId,
      categoryName: category.categoryName,
      amount: toMoneyString(category.cur),
      avg3: null,
      growthPct: null,
      weeklyCap: null,
    },
    severity: category.cur,
  };
}

/**
 * Builds the ranked `flaggedPatterns` (top {@link INSIGHT_MAX_FLAGGED_PATTERNS} by severity, plus
 * one unranked `largest_expense` entry appended last) and `savingsRatePct` for one user+month.
 * @param input - Repository-built numbers for the month (docs/spec/05b §5.9.1).
 */
export function buildInsightSnapshot(input: InsightStatsInput): { flaggedPatterns: InsightFlaggedPattern[]; savingsRatePct: number | null } {
  const ranked: RankedPattern[] = [];

  for (const category of input.categories) {
    ranked.push(...detectCategoryPatterns(category, input.currency, input.allowanceBaseline));
    const newCategory = detectNewCategory(category, input.hasAnyPriorMonthHistory);
    if (newCategory) ranked.push(newCategory);
  }

  // Decimal comparison, never JS float — ties keep their original (stable) relative order.
  ranked.sort((a, b) => b.severity.comparedTo(a.severity));
  const flaggedPatterns = ranked.slice(0, INSIGHT_MAX_FLAGGED_PATTERNS).map((r) => r.pattern);

  // largest_expense is NEVER ranked into the top-3 (a routine large rent payment would otherwise
  // win every month) — always appended last, unranked, when present.
  if (input.largestExpense) {
    flaggedPatterns.push({
      kind: 'largest_expense',
      categoryId: null,
      categoryName: input.largestExpense.categoryName,
      amount: toMoneyString(input.largestExpense.amount),
      avg3: null,
      growthPct: null,
      weeklyCap: null,
    });
  }

  return { flaggedPatterns, savingsRatePct: savingsRatePct(input.totalIncome, input.totalExpense) };
}

/**
 * Reshapes a computed snapshot into the `integrations/ai` prompt shape. `largest_expense` is
 * deliberately DROPPED here (documented judgment call): an architect review's guidance for that
 * entry was "send only `{categoryName, amount}`, never description/merchantKey" — the simplest
 * compliant reading is to not send it to the LLM at all, since it carries no averaged/derived
 * numbers the model needs and a large one-off (e.g. rent) is exactly the kind of number that would
 * otherwise tempt the model into unwanted commentary. It IS still persisted/returned in the DB/API
 * `flaggedPatterns` (see {@link buildInsightSnapshot}) and the template fallback may reference it.
 */
export function toInsightStatsForPrompt(
  snapshot: { flaggedPatterns: InsightFlaggedPattern[]; savingsRatePct: number | null },
  month: LocalDate,
  currency: string,
  totalIncome: Decimal,
  totalExpense: Decimal,
): InsightStats {
  const flaggedPatterns: InsightStatsFlaggedPattern[] = snapshot.flaggedPatterns
    .filter((p) => p.kind !== 'largest_expense')
    .map((p) => ({ kind: p.kind, categoryName: p.categoryName, amount: p.amount, avg3: p.avg3, growthPct: p.growthPct, weeklyCap: p.weeklyCap }));

  return {
    month,
    currency,
    totalIncome: toMoneyString(totalIncome),
    totalExpense: toMoneyString(totalExpense),
    savingsRatePct: snapshot.savingsRatePct,
    flaggedPatterns,
    locale: 'en',
  };
}
