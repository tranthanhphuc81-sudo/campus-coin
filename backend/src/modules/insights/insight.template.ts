/**
 * insight.template.ts
 * Deterministic, English, template-based fallback for the monthly insight — used whenever the LLM
 * is disabled/opted-out, fails, times out, or is rejected by the numeric-grounding gate
 * (docs/spec/05b §5.9.1/§5.9.3). Built purely from the backend-computed snapshot, so it is always
 * available even with `AI_API_KEY` empty. NOT the `tip_templates` DB table — that backs the
 * separate savings-tips engine (a different P13 feature, not built by this module).
 * Main exports: buildTemplateInsight
 * Spec: docs/spec/05b §5.9.1 (flagged patterns) · §5.9.3 (fallback wording)
 */
import type { InsightFlaggedPattern } from '@campuscoin/shared';
import type { InsightText } from '../../integrations/ai/types.js';
import { formatMoney } from '../../lib/money.js';

const GENERIC_SUMMARY = 'Your spending looked steady this month — no unusual patterns detected.';
const GENERIC_TIP = 'Keep tracking your spending to stay on top of your budget.';

/**
 * The highest-ranked pattern to drive the headline sentence, or `null` when there is none (or the
 * only entry is the always-unranked `largest_expense`, which never drives the headline — a routine
 * large rent payment should not read as an "alert").
 */
function primaryPattern(patterns: InsightFlaggedPattern[]): InsightFlaggedPattern | null {
  const first = patterns[0];
  return first && first.kind !== 'largest_expense' ? first : null;
}

/** Builds the one-sentence headline for `pattern`'s kind. */
function summarySentenceFor(pattern: InsightFlaggedPattern, currency: string): string {
  switch (pattern.kind) {
    case 'growth':
      return `Your spending on ${pattern.categoryName} was ${pattern.growthPct}% higher than usual this month.`;
    case 'budget_exceeded':
      // `pattern.amount` is the category's TOTAL spend this month (see the shared `InsightFlaggedPattern`
      // doc comment) — the pattern DTO does not carry the budget limit itself, so this reads as
      // "total spent" rather than a precise overage delta. Documented judgment call.
      return `${pattern.categoryName} went over its budget — you spent ${formatMoney(pattern.amount ?? '0', currency)} in it this month.`;
    case 'new_category':
      return `${pattern.categoryName} is a new expense category this month, totalling ${formatMoney(pattern.amount ?? '0', currency)}.`;
    default:
      return GENERIC_SUMMARY;
  }
}

/** One extra sentence about the month's overall savings rate, or `null` when there is none to report. */
function savingsSentenceFor(savingsRatePct: number | null): string | null {
  if (savingsRatePct === null) return null;
  return savingsRatePct >= 0 ? `You saved ${savingsRatePct}% of your income this month.` : 'You spent more than you earned this month.';
}

/**
 * Builds the deterministic template insight for one month's snapshot.
 * @param snapshot - The same `{flaggedPatterns, savingsRatePct}` shape `buildInsightSnapshot` returns.
 * @param currency - The user's display currency, for money formatting.
 */
export function buildTemplateInsight(
  snapshot: { flaggedPatterns: InsightFlaggedPattern[]; savingsRatePct: number | null },
  currency: string,
): InsightText {
  const primary = primaryPattern(snapshot.flaggedPatterns);

  const headline = primary ? summarySentenceFor(primary, currency) : GENERIC_SUMMARY;
  const savingsSentence = savingsSentenceFor(snapshot.savingsRatePct);
  const summaryText = savingsSentence ? `${headline} ${savingsSentence}` : headline;

  const tipText =
    primary?.kind === 'growth' && primary.weeklyCap
      ? `Try capping it at ${formatMoney(primary.weeklyCap, currency)}/week for the rest of the month.`
      : GENERIC_TIP;

  return { summaryText, tipText };
}
