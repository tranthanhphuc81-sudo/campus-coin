/**
 * types.ts
 * Shared types for the provider-agnostic AI adapter (docs/spec/05b: 3-tier categorization,
 * P13: monthly insights). Every provider (Gemini, OpenAI, Null) implements {@link AiProvider}.
 * Main exports: CategorizeItem, CategorizeRequest, CategorizeResultItem, InsightStats,
 *   InsightStatsFlaggedPattern, InsightText, AiProvider
 * Spec: docs/spec/05b (AI categorization) · docs/spec/05c (insights, P13)
 */
import type { TransactionType } from '@campuscoin/shared';

/** One transaction description to classify, keyed by its position in the request. */
export interface CategorizeItem {
  index: number;
  text: string;
}

/** Batch categorize request sent to an {@link AiProvider}. */
export interface CategorizeRequest {
  type: TransactionType;
  /** Allowed category names, exactly as stored (case-sensitive canonical form). */
  categories: string[];
  items: CategorizeItem[];
  /** Overrides the provider's default timeout for this call (D7: batch vs interactive). */
  timeoutMs?: number;
}

/** One classified item, aligned back to {@link CategorizeItem.index}. */
export interface CategorizeResultItem {
  index: number;
  /** Canonical category name (guaranteed to be a member of the request's `categories`). */
  category: string;
  /** Confidence in `[0, 1]`, already clamped to `AI_LLM_CONFIDENCE_MAX`. */
  confidence: number;
}

/** One detected spending pattern, formatted for the LLM prompt (backend-computed, never trusted
 * from the model). Mirrors `@campuscoin/shared`'s `InsightFlaggedPattern` but keeps its own shape
 * here so `integrations/ai` never depends on the DTO layer — `largest_expense` is deliberately
 * never included (see `insights.stats.ts`'s `toInsightStatsForPrompt`). */
export interface InsightStatsFlaggedPattern {
  kind: 'growth' | 'budget_exceeded' | 'new_category' | 'largest_expense';
  categoryName: string | null;
  /** Decimal string. */
  amount: string | null;
  avg3: string | null;
  growthPct: number | null;
  weeklyCap: string | null;
}

/** Backend-computed numbers for one user's monthly insight — the ONLY data the LLM sees; it never
 * receives raw transaction rows/descriptions (docs/spec/09 §9.9 minimisation). */
export interface InsightStats {
  /** First day of the analysed month, `YYYY-MM-01`. */
  month: string;
  currency: string;
  totalIncome: string;
  totalExpense: string;
  savingsRatePct: number | null;
  /** Max 3, already sanitized category names (see `providers/base.provider.ts`). */
  flaggedPatterns: InsightStatsFlaggedPattern[];
  locale: 'en';
}

/** The two prose fields the LLM writes around backend-computed stats. */
export interface InsightText {
  summaryText: string;
  tipText: string;
}

/** Provider-agnostic AI adapter. Every method must never throw for a caller-recoverable reason
 * without being wrapped in {@link import('./errors.js').AiProviderError} — callers treat any
 * throw as "AI unavailable, fall back" and must never let it block the underlying save/request. */
export interface AiProvider {
  name: string;
  /** False for the `NullProvider` (no API key configured, or running in tests) — tier 3 is skipped. */
  enabled: boolean;
  /** Classifies a batch of descriptions into one of `req.categories` each (or omits an item). */
  categorize(req: CategorizeRequest): Promise<CategorizeResultItem[]>;
  /** Writes a monthly insight from backend-computed stats. Returns `null` only when the provider
   * itself is disabled (NullProvider); throws `AiProviderError` (never returns malformed text) on
   * any transport/validation failure — callers must catch and fall back to a template. */
  writeInsight(stats: InsightStats): Promise<InsightText | null>;
}
