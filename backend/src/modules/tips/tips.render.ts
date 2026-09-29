/**
 * tips.render.ts
 * Pure template rendering + ranking math for the savings-tips engine — no DB access, so this is
 * cheap to unit test in isolation from `tips.repository.ts`.
 * Main exports: renderTemplate, selectTemplate, confidenceFor, recencyFor, computeScore
 * Spec: docs/spec/05b §5.10 (Bảng 23)
 */
import {
  TIP_CONFIDENCE_1_MONTH,
  TIP_CONFIDENCE_2_MONTHS,
  TIP_CONFIDENCE_3_PLUS_MONTHS,
  TIP_RECENCY_DECAY_DAYS,
  TIP_RECENCY_FLOOR,
  type TipRuleType,
} from '@campuscoin/shared';
import type { TipTemplateModel } from '../../generated/prisma/models/TipTemplate.js';
import { diffInDays, type LocalDate } from '../../lib/dates.js';
import { Decimal } from '../../lib/money.js';
import { sha256Hex } from '../../lib/tokens.js';
import type { TipCandidateVars } from './tips.types.js';

/** Matches every `{category}`/`{amount}`/`{percent}` placeholder in a template string. */
const PLACEHOLDER = /\{(category|amount|percent)\}/g;
/** ASCII control characters (incl. DEL) stripped from rendered text — never HTML-escaped (see below). */
// eslint-disable-next-line no-control-regex -- intentionally targets control characters.
const CONTROL_CHARS = /[\x00-\x1f\x7f]/g;

/**
 * Fills a template's `{category}`/`{amount}`/`{percent}` placeholders in a single pass — a
 * category literally named `"{amount}"` is never re-expanded, because `String.replace` with a
 * callback substitutes into the OUTPUT string only once, never re-scanning it.
 * Deliberately does NOT HTML-escape: React already escapes on render, so escaping here would
 * double-escape and show a literal `&amp;` for a category like "Food & Drinks". Control
 * characters are stripped and the result is truncated to the DB column size.
 * @param tpl - `titleTpl`/`bodyTpl` from a `TipTemplate` row.
 * @param vars - Placeholder values; a placeholder with no matching (defined) var renders as `''`.
 * @param maxLength - DB column size (`renderedTitle` 200, `renderedBody` 600).
 */
export function renderTemplate(tpl: string, vars: TipCandidateVars, maxLength: number): string {
  // `key` only ever comes from the fixed PLACEHOLDER regex's own capture group (category|amount|percent),
  // never from user/client input, so this is not a real object-injection sink.
  // eslint-disable-next-line security/detect-object-injection
  const substituted = tpl.replace(PLACEHOLDER, (_match, key: keyof TipCandidateVars) => vars[key] ?? '');
  const stripped = substituted.replace(CONTROL_CHARS, '');
  return stripped.length > maxLength ? stripped.slice(0, maxLength) : stripped;
}

/** Every `{category}`/`{amount}`/`{percent}` placeholder name appearing in `text`, deduplicated. */
function placeholdersIn(text: string): (keyof TipCandidateVars)[] {
  return [...new Set([...text.matchAll(PLACEHOLDER)].map((m) => m[1] as keyof TipCandidateVars))];
}

/**
 * Picks one active template for `ruleType` whose every placeholder is satisfiable by `vars`,
 * deterministically varying by `seed` (typically `${userId}:${period}:${ruleType}`) so different
 * users/months see different wording among a rule's 1-3 templates.
 * @returns `null` when no active template of this rule type has all its placeholders satisfied —
 *   the caller must skip generating a tip for this candidate this refresh.
 */
export function selectTemplate(
  templates: readonly TipTemplateModel[],
  ruleType: TipRuleType,
  vars: TipCandidateVars,
  seed: string,
): TipTemplateModel | null {
  const qualifying = templates.filter((t) => {
    if (!t.isActive || t.ruleType !== ruleType) return false;
    const placeholders = placeholdersIn(`${t.titleTpl} ${t.bodyTpl}`);
    // `p` only ever comes from the fixed PLACEHOLDER regex's own capture group, never client input.
    // eslint-disable-next-line security/detect-object-injection
    return placeholders.every((p) => vars[p] !== undefined);
  });
  if (qualifying.length === 0) return null;
  // First 8 hex chars (32 bits) of a SHA-256 digest is far more than enough entropy to pick among
  // at most a handful of templates without any human-noticeable bias.
  const hash = Number.parseInt(sha256Hex(seed).slice(0, 8), 16);
  return qualifying[hash % qualifying.length]!;
}

/** Confidence multiplier for a score, by months of trailing history available (0-3; §5.10 Bảng 23). */
export function confidenceFor(monthsAvailable: number): string {
  if (monthsAvailable >= 3) return TIP_CONFIDENCE_3_PLUS_MONTHS;
  if (monthsAvailable === 2) return TIP_CONFIDENCE_2_MONTHS;
  return TIP_CONFIDENCE_1_MONTH;
}

/**
 * Recency multiplier: 1.0 for a brand-new tip, decaying linearly to `TIP_RECENCY_FLOOR` over
 * `TIP_RECENCY_DECAY_DAYS`. Pinned tips are exempt from decay (always pass `createdAt: null`
 * for a pinned row) — they already sort first regardless, this only keeps their displayed score
 * from looking misleadingly low.
 * @param createdAt - Local date the SAME `(templateId, categoryId, period)` row was first
 *   created, or `null` for a brand-new/pinned tip (recency 1.0).
 */
export function recencyFor(createdAt: LocalDate | null, today: LocalDate): number {
  if (createdAt == null) return 1.0;
  const ageDays = diffInDays(createdAt, today);
  return Math.max(TIP_RECENCY_FLOOR, 1 - ageDays / TIP_RECENCY_DECAY_DAYS);
}

/** `impact x confidence x recency`, rounded to 4 decimal places (matches `user_tips.score` scale). */
export function computeScore(impact: Decimal, confidence: string, recency: number): Decimal {
  return impact.times(confidence).times(recency).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}
