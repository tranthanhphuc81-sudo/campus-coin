/**
 * ai.service.ts
 * Business logic for 3-tier category suggestion (tier 1: personal rule, tier 2: keyword
 * dictionary, tier 3: LLM) and the feedback endpoint that teaches tier-1 rules. Every function
 * takes `userId` from the verified token; AI must never block saving a transaction — every tier-3
 * failure (timeout, quota, disabled, provider error) resolves to `null`, never a thrown error.
 * Main exports: suggest, suggestBatch, recordFeedback, SuggestBatchItem
 * Spec: docs/spec/05b §5.6 (AI categorization) · Rules: D3, D5, D9, D10, D11
 *   · docs/spec/09 §9.14 (opt-out takes effect immediately on every provider call path)
 */
import {
  AI_BATCH_SIZE,
  AI_BATCH_TIMEOUT_MS,
  AI_CACHE_NEGATIVE_TTL_SEC,
  AI_CACHE_TTL_SEC,
  AI_CONFIDENCE_KEYWORD,
  AI_LEARNED_DEDUPE_TTL_SEC,
  SYSTEM_OWNER_KEY,
  UserStatus,
  type AiFeedbackInput,
  type CategorizeSuggestInput,
  type CategorySuggestionDto,
  type TransactionType,
} from '@campuscoin/shared';
import * as categoriesService from '../categories/categories.service.js';
import { categoriesRepository } from '../categories/categories.repository.js';
import { transactionsRepository } from '../transactions/transactions.repository.js';
import { usersRepository } from '../users/users.repository.js';
import { AiProviderError, getAiProvider, PROMPT_VERSION, sanitize } from '../../integrations/ai/index.js';
import { cacheGet, cacheSet, markOnceOrProceed } from '../../lib/cache.js';
import { aiCategoryCacheKey, aiLearnedKey } from '../../lib/cacheKeys.js';
import { normalizeMerchantKey } from '../../lib/merchantKey.js';
import { notFound, validationFailed } from '../../lib/problem.js';
import { sha256Hex } from '../../lib/tokens.js';
import { classifyWithLlm } from './ai.llm.js';
import { matchKeyword } from './ai.keywords.js';
import { aiRulesRepository } from './ai.repository.js';
import { ruleConfidence } from './ai.rules.js';
import { tryConsumeLlmQuota } from './ai.quota.js';

/** A cached tier-3 result: the resolved category name + raw confidence, or `null` for a cached miss. */
interface CachedTier3Result {
  categoryName: string;
  confidence: number;
}

/**
 * Builds the tier-3 cache key: the EXACT sanitized text sent to the LLM + prompt version + the
 * sorted allowed category names (D11: not user-scoped). `sanitizedText` MUST be `sanitize(description)`
 * — never the raw description or `normalizeMerchantKey(description)` — see `aiCategoryCacheKey`'s
 * doc comment for why the merchant key is unsafe to key this cache on (P10 review, High finding).
 */
function tier3CacheKey(sanitizedText: string, type: TransactionType, sortedNames: string[]): string {
  const listVersion = sha256Hex([PROMPT_VERSION, type, ...sortedNames].join('\n'));
  return aiCategoryCacheKey(sanitizedText, listVersion);
}

/**
 * Fresh (never cached) read of whether `userId` may currently reach the LLM: `aiOptIn` AND the
 * account must still be `active` (docs/spec/09 §9.14: "tắt ai_opt_in có hiệu lực ngay" — opt-out
 * takes effect immediately). Security fix (Low): a `DELETE /me` disables the account but never
 * touches `aiOptIn` — without the status check, an in-flight import/insight job for that user could
 * still reach the LLM after the account was disabled. Every tier-3 call site (and
 * `insights.generate.ts`'s pre-LLM re-check) MUST call this right before it would touch the
 * LLM/cache, never trust a value read earlier in the same request/batch/job.
 */
export async function isAiOptedIn(userId: string): Promise<boolean> {
  const user = await usersRepository.findById(userId);
  return user?.status === UserStatus.ACTIVE && user.aiOptIn;
}

/**
 * Suggests a category for a transaction description, trying tier 1 (personal rule) then tier 2
 * (keyword dictionary) then, only on a miss, tier 3 (LLM — gated behind `aiOptIn`, the daily
 * quota, and a 7-day result cache).
 * @param userId - Caller.
 * @param input - Description + transaction type.
 * @returns A suggestion, or `null` when nothing matched (never throws for an AI-side failure).
 */
export async function suggest(userId: string, input: CategorizeSuggestInput): Promise<CategorySuggestionDto | null> {
  const merchantKey = normalizeMerchantKey(input.description);
  if (!merchantKey) return null;

  const categories = await categoriesService.list(userId, { type: input.type, includeInactive: false });
  if (categories.length === 0) return null;
  const byId = new Map(categories.map((c) => [c.id, c]));
  const byName = new Map(categories.map((c) => [c.name, c]));
  const allowedNames = new Set(categories.map((c) => c.name));

  // Tier 1: the caller's own personal rule for this merchant key.
  const rule = await aiRulesRepository.findByMerchantKey(userId, merchantKey);
  if (rule) {
    const ruleCategory = byId.get(rule.categoryId);
    if (ruleCategory) {
      return { categoryId: ruleCategory.id, categoryName: ruleCategory.name, confidence: ruleConfidence(rule.hitCount), tier: 1 };
    }
  }

  // Tier 2: keyword dictionary, restricted to the caller's active categories of this type.
  const keywordMatch = matchKeyword(input.description, allowedNames);
  if (keywordMatch) {
    const category = byName.get(keywordMatch);
    if (category) return { categoryId: category.id, categoryName: category.name, confidence: AI_CONFIDENCE_KEYWORD, tier: 2 };
  }

  // Tier 3: LLM, only reached on a tier 1+2 miss. Fresh DB read (§9.14): never trust a value read
  // earlier in this request.
  const provider = getAiProvider();
  if (!provider.enabled || !(await isAiOptedIn(userId))) return null;

  const sortedNames = [...allowedNames].sort();
  // BR fix (High): key the cache on exactly what the LLM will see, not the merchant key.
  const sanitizedText = sanitize(input.description);
  const cacheKey = tier3CacheKey(sanitizedText, input.type, sortedNames);

  const cached = await cacheGet<CachedTier3Result | null>(cacheKey);
  if (cached !== undefined) {
    if (cached === null) return null;
    const category = byName.get(cached.categoryName);
    return category ? { categoryId: category.id, categoryName: category.name, confidence: cached.confidence.toFixed(3), tier: 3 } : null;
  }

  if (!(await tryConsumeLlmQuota(userId))) return null;

  let llmResults: Awaited<ReturnType<typeof classifyWithLlm>>;
  try {
    llmResults = await classifyWithLlm(provider, input.type, sortedNames, [input.description]);
  } catch (err) {
    if (err instanceof AiProviderError) return null; // AI must never block saving (TC-17).
    throw err;
  }

  const result = llmResults[0];
  const category = result ? byName.get(result.category) : undefined;
  if (!result || !category) {
    await cacheSet(cacheKey, null, AI_CACHE_NEGATIVE_TTL_SEC);
    return null;
  }

  await cacheSet(cacheKey, { categoryName: category.name, confidence: result.confidence }, AI_CACHE_TTL_SEC);
  return { categoryId: category.id, categoryName: category.name, confidence: result.confidence.toFixed(3), tier: 3 };
}

/** One item of a {@link suggestBatch} call (D9: each row carries its own type/sign, e.g. a CSV import row). */
export interface SuggestBatchItem {
  description: string;
  type: TransactionType;
}

/**
 * Batch variant of {@link suggest} for P11's CSV importer: dedupes by (type, merchant key),
 * spends at most one `tryConsumeLlmQuota` call per chunk of {@link AI_BATCH_SIZE} DISTINCT
 * merchant keys still needing tier 3 (D3/D7), and isolates a failing chunk to just its own items.
 * @param userId - Caller.
 * @param items - Rows to suggest a category for, in order.
 * @returns One suggestion (or `null`) per input row, in the same order.
 */
export async function suggestBatch(userId: string, items: SuggestBatchItem[]): Promise<(CategorySuggestionDto | null)[]> {
  const results: (CategorySuggestionDto | null)[] = new Array(items.length).fill(null);
  if (items.length === 0) return results;

  const byType = new Map<TransactionType, number[]>();
  items.forEach((item, index) => {
    const list = byType.get(item.type) ?? [];
    list.push(index);
    byType.set(item.type, list);
  });

  const provider = getAiProvider();

  // Every array index below (`index`/`i`) is either a loop counter or comes from `.map`/`.forEach`
  // over this function's own internal arrays — never a client-supplied property name.
  /* eslint-disable security/detect-object-injection */
  for (const [type, indexes] of byType) {
    const categories = await categoriesService.list(userId, { type, includeInactive: false });
    if (categories.length === 0) continue;
    const byId = new Map(categories.map((c) => [c.id, c]));
    const byName = new Map(categories.map((c) => [c.name, c]));
    const allowedNames = new Set(categories.map((c) => c.name));
    const sortedNames = [...allowedNames].sort();

    const entries = indexes.map((index) => ({ index, mk: normalizeMerchantKey(items[index]!.description) }));
    const uniqueKeys = [...new Set(entries.filter((e) => e.mk).map((e) => e.mk as string))];
    const rules = await aiRulesRepository.findManyByMerchantKeys(userId, uniqueKeys);
    const ruleByKey = new Map(rules.map((r) => [r.merchantKey, r]));

    // mk -> item indexes still needing tier 3, after tier 1/2 resolve what they can.
    const tier3Indexes = new Map<string, number[]>();

    for (const { index, mk } of entries) {
      if (!mk) continue;

      const rule = ruleByKey.get(mk);
      const ruleCategory = rule ? byId.get(rule.categoryId) : undefined;
      if (rule && ruleCategory) {
        results[index] = { categoryId: ruleCategory.id, categoryName: ruleCategory.name, confidence: ruleConfidence(rule.hitCount), tier: 1 };
        continue;
      }

      const keywordMatch = matchKeyword(items[index]!.description, allowedNames);
      const keywordCategory = keywordMatch ? byName.get(keywordMatch) : undefined;
      if (keywordCategory) {
        results[index] = { categoryId: keywordCategory.id, categoryName: keywordCategory.name, confidence: AI_CONFIDENCE_KEYWORD, tier: 2 };
        continue;
      }

      const list = tier3Indexes.get(mk) ?? [];
      list.push(index);
      tier3Indexes.set(mk, list);
    }

    // §9.14 hardening: a fresh DB read gates even the cache lookups below (matching `suggest()`'s
    // own gate order) — an opted-out user must not receive a tier-3 result at all, cached or not.
    if (tier3Indexes.size === 0 || !provider.enabled || !(await isAiOptedIn(userId))) continue;

    // BR fix (High): the cache key must reflect the EXACT text sent to the LLM, never the merchant
    // key (`mk`) itself — `mk` only groups items to dedupe the provider call, one representative
    // description per group. Precompute each group's sanitized representative text once.
    const mkSanitizedText = new Map<string, string>();
    for (const mk of tier3Indexes.keys()) {
      mkSanitizedText.set(mk, sanitize(items[tier3Indexes.get(mk)![0]!]!.description));
    }

    // Cache lookup first — only genuinely-uncached keys spend LLM/quota budget.
    const uncachedKeys: string[] = [];
    for (const mk of tier3Indexes.keys()) {
      const cacheKey = tier3CacheKey(mkSanitizedText.get(mk)!, type, sortedNames);
      const cached = await cacheGet<CachedTier3Result | null>(cacheKey);
      if (cached === undefined) {
        uncachedKeys.push(mk);
        continue;
      }
      if (cached === null) continue;
      const category = byName.get(cached.categoryName);
      if (!category) continue;
      for (const index of tier3Indexes.get(mk)!) {
        results[index] = { categoryId: category.id, categoryName: category.name, confidence: cached.confidence.toFixed(3), tier: 3 };
      }
    }

    for (let offset = 0; offset < uncachedKeys.length; offset += AI_BATCH_SIZE) {
      const chunkKeys = uncachedKeys.slice(offset, offset + AI_BATCH_SIZE);
      // §9.14 hardening: re-check right before EACH chunk's own LLM call — a mid-import opt-out
      // (e.g. from another tab) must take effect on the very next chunk, not just at batch start.
      if (!(await isAiOptedIn(userId))) continue;
      // D3/D7: ONE quota-consuming call per chunk, however many items it covers.
      if (!(await tryConsumeLlmQuota(userId))) continue;

      const texts = chunkKeys.map((mk) => items[tier3Indexes.get(mk)![0]!]!.description);
      let chunkResults: Awaited<ReturnType<typeof classifyWithLlm>>;
      try {
        chunkResults = await classifyWithLlm(provider, type, sortedNames, texts, { timeoutMs: AI_BATCH_TIMEOUT_MS });
      } catch {
        continue; // one failing chunk only nulls that chunk's items — the rest are unaffected.
      }

      chunkKeys.forEach((mk, i) => {
        const cacheKey = tier3CacheKey(mkSanitizedText.get(mk)!, type, sortedNames);
        const result = chunkResults[i];
        const category = result ? byName.get(result.category) : undefined;
        if (!result || !category) {
          void cacheSet(cacheKey, null, AI_CACHE_NEGATIVE_TTL_SEC);
          return;
        }
        void cacheSet(cacheKey, { categoryName: category.name, confidence: result.confidence }, AI_CACHE_TTL_SEC);
        for (const index of tier3Indexes.get(mk)!) {
          results[index] = { categoryId: category.id, categoryName: category.name, confidence: result.confidence.toFixed(3), tier: 3 };
        }
      });
    }
  }
  /* eslint-enable security/detect-object-injection */

  return results;
}

/**
 * Looks up the caller's tier-1 rule category for a merchant key, if any. Used by
 * `transactions.service.ts` to detect whether an accepted AI suggestion was actually tier 1 (so it
 * can derive `categorySource: 'rule'` instead of `'ai_accepted'`) without reaching into the AI
 * module's repository directly (CLAUDE.md: modules talk to each other via services only).
 */
export async function findRuleCategoryId(userId: string, merchantKey: string): Promise<number | null> {
  const rule = await aiRulesRepository.findByMerchantKey(userId, merchantKey);
  return rule?.categoryId ?? null;
}

/**
 * Records a user's category choice for a merchant key, teaching tier 1 (D10: also used stand-
 * alone by P11's CSV importer, with a raw description instead of a real merchant key — this
 * re-normalises either way). Idempotent per transaction version (a domain-event handler and a
 * direct feedback call for the same edit must not double-count).
 * @throws {AppError} 404 when `transactionId` is given but not owned/active, or when
 *   `chosenCategoryId` is not visible/active for this caller; 422 when the description/merchantKey
 *   is empty after normalising.
 */
export async function recordFeedback(userId: string, input: AiFeedbackInput): Promise<void> {
  const merchantKey = normalizeMerchantKey(input.merchantKey);
  if (!merchantKey) {
    throw validationFailed([{ field: 'merchantKey', message: 'Could not derive a merchant key from this text.' }]);
  }

  // BR fix (Low, cross-tenant invariant): a category that doesn't exist, isn't visible to this
  // user, or isn't active is 404 — not 422 — per CLAUDE.md's "resource of another user -> 404, not
  // 403/422" rule. `findVisible` has no `type` filter to distinguish "wrong type" from "not found"
  // (a merchant key can apply to either direction), so every miss here is genuinely not-found.
  const category = await categoriesRepository.findVisible(input.chosenCategoryId, [userId, SYSTEM_OWNER_KEY]);
  if (!category) throw notFound('Category not found.');

  if (input.transactionId) {
    const txn = await transactionsRepository.findActiveOwned(input.transactionId, userId);
    if (!txn) throw notFound('Transaction not found.');

    const canProceed = await markOnceOrProceed(aiLearnedKey(txn.id, txn.version), AI_LEARNED_DEDUPE_TTL_SEC);
    if (!canProceed) return; // already learned from this exact transaction version.
  }

  await aiRulesRepository.applyUserChoice(userId, merchantKey, input.chosenCategoryId);
}
