/**
 * cacheKeys.ts
 * Single source of Redis key conventions for categories/dashboard/report/AI caching (docs/spec/10
 * §10.3). P09 (dashboard), P12 (reports) and P10 (AI) MUST reuse these builders instead of
 * inventing their own Redis key strings, so P07's cache-invalidator can find and delete everything
 * it needs to.
 * Main exports: categoriesKey, categoriesPattern, categoriesGlobalPattern, dashboardKey,
 *   reportMonthPattern, reportRangePattern, announcementsActiveKey, aiCategoryCacheKey,
 *   aiQuotaKey, aiLearnedKey
 * Spec: docs/spec/10 §10.3 (cache strategy)
 */
import { firstDayOfMonth, type LocalDate } from './dates.js';
import { sha256Hex } from './tokens.js';

/** Category type filter a cached category list was built with ("all" = both types). */
export type CategoriesKeyType = 'income' | 'expense' | 'all';
/** Active-only vs including-inactive scope a cached category list was built with. */
export type CategoriesKeyScope = 'active' | 'all';

/** Cache key for one user's category list, keyed by the `type`/`includeInactive` filters used. */
export function categoriesKey(userId: string, type: CategoriesKeyType, scope: CategoriesKeyScope): string {
  return `categories:${userId}:${type}:${scope}`;
}

/** Pattern matching every cached category-list variant for a user (any type/scope combination). */
export function categoriesPattern(userId: string): string {
  return `categories:${userId}:*`;
}

/**
 * Pattern matching EVERY user's cached category list (P15: an admin create/update/archive/delete
 * of a system-default category changes what every user's list contains, not just one user's).
 */
export function categoriesGlobalPattern(): string {
  return 'categories:*';
}

/** Cache key for a user's dashboard summary of a given month (`month` is normalised to its first day). */
export function dashboardKey(userId: string, month: LocalDate): string {
  return `dash:${userId}:${firstDayOfMonth(month)}`;
}

/** Pattern matching every cached report variant for a user's given month. */
export function reportMonthPattern(userId: string, month: LocalDate): string {
  return `report:${userId}:${firstDayOfMonth(month)}:*`;
}

/** Cache key for a report scoped to exactly one month (`kind` distinguishes report types), matching {@link reportMonthPattern}. */
export function reportMonthKey(userId: string, month: LocalDate, kind: string): string {
  return `report:${userId}:${firstDayOfMonth(month)}:${kind}`;
}

/** Pattern matching every cached date-range report for a user. */
export function reportRangePattern(userId: string): string {
  return `report:${userId}:range:*`;
}

/** Cache key for a report scoped to an arbitrary date range/filter set, matching {@link reportRangePattern}. */
export function reportRangeKey(userId: string, kind: string, fingerprint: string): string {
  return `report:${userId}:range:${kind}:${fingerprint}`;
}

/** Cache key for the (global, not per-user) list of currently-active announcements. */
export function announcementsActiveKey(): string {
  return 'announcements:active';
}

// ---- AI (P10) -------------------------------------------------------------------------------
// Distinct prefixes (`ai:`, `ai-quota:`, `ai-learned:`) so these never collide with each other or
// with any other cache family's keys.

/**
 * Cache key for a tier-3 (LLM) categorization result (D11: not user-scoped — the EXACT sanitized
 * text the LLM saw + category list + prompt version only — but still gated behind the caller's own
 * `aiOptIn` on read).
 *
 * Security fix (P10 review, High): this MUST be derived from `sanitize(description)` (what the
 * provider actually received), never from `normalizeMerchantKey(description)`. The merchant key
 * throws away digits, full-width characters and non-Latin scripts, so two textually different
 * descriptions (one hiding a prompt-injection payload in characters the merchant key discards, one
 * clean) could previously normalise to the SAME merchant key and collide on this cache — letting
 * one user's poisoned tier-3 answer be served to a different user who typed the clean text.
 * @param sanitizedText - The exact `sanitize()` output sent (or that would be sent) to the
 *   provider for this description — never the raw description or a merchant key.
 * @param listVersion - Hash already encoding prompt version + transaction type + sorted category
 *   names (see `ai.service.ts`'s `tier3CacheKey`).
 */
export function aiCategoryCacheKey(sanitizedText: string, listVersion: string): string {
  return `ai:${sha256Hex(`${sanitizedText}\n${listVersion}`)}`;
}

/**
 * Redis key tracking a user's daily LLM-provider-call quota (D3: one key per user per UTC day).
 * L5 review fix: was keyed on the caller's LOCAL calendar day, so changing profile timezone across
 * a UTC-day boundary could refill (or double-spend) the quota early — UTC is simpler and closes it.
 * @param utcDate - `YYYY-MM-DD` in UTC (see `ai.quota.ts`'s `todayUtc`), not a user-local date.
 */
export function aiQuotaKey(userId: string, utcDate: LocalDate): string {
  return `ai-quota:${userId}:${utcDate}`;
}

/** Idempotency guard so the same transaction version is never learned twice (event + feedback race). */
export function aiLearnedKey(transactionId: string, version: number): string {
  return `ai-learned:${transactionId}:${version}`;
}

// ---- CSV import (P11) -------------------------------------------------------------------------

/** Redis key for a batch's decoded raw CSV text — only needed long enough for `import.parse` to run. */
export function importRawKey(batchId: string): string {
  return `import:${batchId}:raw`;
}

/** Redis key for a batch's parsed preview (docs/spec/05a §5.5: 24h TTL, never persisted to MySQL). */
export function importPreviewKey(batchId: string): string {
  return `import:${batchId}`;
}

/** Short-lived lock guarding concurrent `PATCH /imports/:id/rows` calls against the same preview. */
export function importLockKey(batchId: string): string {
  return `import:${batchId}:lock`;
}
