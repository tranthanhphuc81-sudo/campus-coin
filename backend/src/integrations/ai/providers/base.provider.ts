/**
 * base.provider.ts
 * Shared `categorize()` implementation for every real LLM provider: sanitises every item's text
 * (enforced here so no provider/caller can forget it — docs/spec/09 §9.9), builds the v1 prompt,
 * calls the provider-specific JSON completion, then parses/gates the output. Concrete providers
 * only implement `completeJson` (the actual HTTP call).
 * Main exports: JsonLlmProvider
 * Spec: docs/spec/05b (AI categorization, tier 3) · docs/spec/09 §9.9
 */
import { INSIGHT_LLM_TIMEOUT_MS } from '@campuscoin/shared';
import { buildCategorizePrompt, parseCategorizeOutput } from '../prompts/categorize.v1.js';
import { buildInsightPrompt, parseInsightOutput } from '../prompts/insight.v1.js';
import { sanitize } from '../sanitize.js';
import type { AiProvider, CategorizeRequest, CategorizeResultItem, InsightStats, InsightText } from '../types.js';

/** Base class every real (non-Null) AI provider extends. */
export abstract class JsonLlmProvider implements AiProvider {
  abstract readonly name: string;
  readonly enabled = true;

  /**
   * Sanitises input (both item text AND category names — L2 review fix: a user-created category
   * name can itself contain PII, e.g. "Loan to Minh 0912...", so it must never reach the provider
   * unsanitised either), builds the categorize prompt, and gates the parsed output against the
   * request's own (sanitised) allow-list. Subclasses never need to repeat this — only `completeJson`
   * differs.
   */
  async categorize(req: CategorizeRequest): Promise<CategorizeResultItem[]> {
    const sanitizedCategories = req.categories.map((name) => sanitize(name));
    const sanitizedReq: CategorizeRequest = {
      ...req,
      categories: sanitizedCategories,
      items: req.items.map((item) => ({ index: item.index, text: sanitize(item.text) })),
    };
    const { system, user } = buildCategorizePrompt(sanitizedReq);
    const raw = await this.completeJson(system, user, req.timeoutMs);
    const sanitizedResults = parseCategorizeOutput(raw, sanitizedCategories, req.items.length);

    // The model can only ever answer with one of `sanitizedCategories` (parseCategorizeOutput's own
    // allow-list gate already enforces that) — map each sanitised name back to its ORIGINAL,
    // canonical category name so the caller (which only knows the original names) can resolve it.
    // `i` is `.map`'s own loop index over this function's own array, never a client-supplied key.
    // eslint-disable-next-line security/detect-object-injection
    const originalBySanitized = new Map(sanitizedCategories.map((sanitizedName, i) => [sanitizedName, req.categories[i]!]));
    return sanitizedResults.map((result) => ({ ...result, category: originalBySanitized.get(result.category) ?? result.category }));
  }

  /**
   * Sanitises every flagged pattern's `categoryName` (a user-created category name can itself
   * carry PII, same reasoning as `categorize`'s category names above), builds the insight prompt,
   * calls the provider-specific JSON completion at {@link INSIGHT_LLM_TIMEOUT_MS}, then runs the
   * numeric-grounding/banned-keyword gate. Throws `AiProviderError('invalid_output')` (never
   * returns malformed text) on any gate failure — the caller falls back to the template.
   */
  async writeInsight(stats: InsightStats): Promise<InsightText | null> {
    const sanitizedStats: InsightStats = {
      ...stats,
      flaggedPatterns: stats.flaggedPatterns.map((p) => ({ ...p, categoryName: p.categoryName ? sanitize(p.categoryName) : null })),
    };
    const { system, user } = buildInsightPrompt(sanitizedStats);
    // TODO(p13): temperature isn't yet parameterized per-call — `completeJson` only takes a
    // timeout override today (see gemini.provider.ts/openai.provider.ts). INSIGHT_LLM_TEMPERATURE
    // (0.3) is therefore not yet wired through; a larger HTTP-call-signature refactor is out of
    // scope for this phase.
    const raw = await this.completeJson(system, user, INSIGHT_LLM_TIMEOUT_MS);
    return parseInsightOutput(raw, sanitizedStats);
  }

  /**
   * Calls the provider's chat/completion endpoint and returns its parsed JSON reply.
   * @param system - System instructions.
   * @param user - User message (categories + descriptions to classify).
   * @param timeoutMs - Optional per-call timeout override.
   */
  protected abstract completeJson(system: string, user: string, timeoutMs?: number): Promise<unknown>;
}
