/**
 * categorySource.ts
 * D1 (P10): `categorySource` is derived server-side, never accepted from the client — a client-
 * supplied value would let it fake AI-quality stats and skip AI-learning entirely.
 * Main exports: deriveCategorySource
 * Spec: docs/spec/05b §5.6 (AI categorization) · Rules: D1
 */
import { CategorySource } from '@campuscoin/shared';

/** Input to {@link deriveCategorySource}: the chosen category plus what tier 1-3 suggested (if anything). */
export interface DeriveCategorySourceInput {
  categoryId: number;
  /** The category tier 1/2/3 suggested for this save, or `null`/`undefined` when none was offered/usable. */
  aiSuggestedCategoryId: number | null | undefined;
  /** The category the caller's tier-1 personal rule points to for this merchant, if any. */
  ruleCategoryId: number | null | undefined;
}

/**
 * Decides `CategorySource` for a saved transaction:
 * - No AI suggestion was offered/usable -> `user`.
 * - The chosen category differs from the suggestion -> `ai_overridden`.
 * - The chosen category matches the suggestion AND matches the caller's tier-1 rule -> `rule`
 *   (the rule is what actually suggested it, detected server-side — no client hint needed).
 * - Otherwise (chosen matches the suggestion, no matching rule) -> `ai_accepted`.
 */
export function deriveCategorySource(input: DeriveCategorySourceInput): CategorySource {
  if (input.aiSuggestedCategoryId == null) return CategorySource.USER;
  if (input.aiSuggestedCategoryId !== input.categoryId) return CategorySource.AI_OVERRIDDEN;
  if (input.ruleCategoryId != null && input.ruleCategoryId === input.categoryId) return CategorySource.RULE;
  return CategorySource.AI_ACCEPTED;
}
