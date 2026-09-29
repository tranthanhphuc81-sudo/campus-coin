/**
 * tips.types.ts
 * Shared shapes for the rule-based savings-tips engine: the candidate a rule function produces,
 * plus the precomputed statistics `tips.repository.ts` gathers for each rule (kept here so the
 * pure rule files in `rules/` never need to import the repository/Prisma).
 * Main exports: TipCandidate, BudgetedCategoryStat, AverageCategoryStat, SmallTxnCategoryStat,
 *   SubscriptionStat, SavingsGapInput, WeekendStat
 * Spec: docs/spec/05b §5.10 (Bảng 23)
 */
import type { TipRuleType } from '@campuscoin/shared';
import type { Decimal } from '../../lib/money.js';

/** Placeholder values a candidate can supply to a template (§5.10: `{category}`/`{amount}`/`{percent}`). */
export interface TipCandidateVars {
  category?: string;
  amount?: string;
  percent?: string;
}

/** One rule's output before it is matched to a template and scored. */
export interface TipCandidate {
  ruleType: TipRuleType;
  categoryId: number | null;
  categoryName: string | null;
  /** Estimated potential saving driving this tip's rank. Always >= 0. */
  impact: Decimal;
  vars: TipCandidateVars;
}

/** R1 over-budget-risk input: one budgeted expense category. */
export interface BudgetedCategoryStat {
  categoryId: number;
  categoryName: string;
  projected: Decimal;
  limit: Decimal;
}

/** R2 above-average input: one expense category with spending this month. */
export interface AverageCategoryStat {
  categoryId: number;
  categoryName: string;
  projected: Decimal;
  /** `null` when none of the 3 trailing months has any data for this category. */
  avg3: Decimal | null;
}

/** R3 small-frequent input: one expense category's "small" transactions in the trailing window. */
export interface SmallTxnCategoryStat {
  categoryId: number;
  categoryName: string;
  smallTxnCount: number;
  smallTxnSum: Decimal;
}

/** R4 multiple-subscriptions input: one active expense recurring rule in the Subscriptions category. */
export interface SubscriptionStat {
  amount: Decimal;
}

/** R5 savings-gap input. */
export interface SavingsGapInput {
  incomeToDate: Decimal;
  allowanceBaseline: Decimal | null;
  projectedTotalExpense: Decimal;
  /** Never `null` when this input object is built — a `null` goal means "skip R5 entirely". */
  savingsGoal: Decimal;
  topOverspendCategory: { categoryName: string } | null;
}

/** R6 weekend-spike input. */
export interface WeekendStat {
  weekendTotal: Decimal;
  avgWeekdaySpend: Decimal;
  weekWeekdayTotal: Decimal;
}
