/**
 * api.ts
 * Thin wrappers around `/ai/categorize/suggest` (interactive tier-1/2/3 category suggestion
 * used by the transaction quick-add/edit form) and `/ai/feedback` (teaches a tier-1 personal
 * rule from the user's final category choice; wired up by the P11 CSV-import review flow, not
 * called anywhere yet).
 * Exports: suggestCategory, submitAiFeedback
 * Spec: docs/spec/05b (AI categorization, 3-tier) · Rules: BR-AI-01..05
 */
import type { AiFeedbackInput, CategorizeSuggestInput, CategorySuggestionDto } from '@campuscoin/shared';
import { apiClient } from '../../lib/apiClient/apiClient';

/**
 * `POST /ai/categorize/suggest` — returns the best available category suggestion for a
 * description/type pair, or `null` when no tier (personal rule, keyword, LLM) could suggest one.
 * Rate-limited 60/min/user server-side; the endpoint never throws for "no suggestion", only for
 * actual request failures (network/5xx), which callers should treat as "no suggestion" too.
 * @param input description + transaction type to categorize.
 * @param signal optional `AbortSignal` to cancel a superseded request (e.g. TanStack Query
 *   aborting a stale suggestion query when the debounced text changes again).
 */
export async function suggestCategory(input: CategorizeSuggestInput, signal?: AbortSignal): Promise<CategorySuggestionDto | null> {
  const response = await apiClient.post<CategorySuggestionDto | null>('/ai/categorize/suggest', input, { signal });
  return response.data;
}

/**
 * `POST /ai/feedback` — records the user's final category choice (accepted/overridden) so a
 * future tier-1 personal rule can be learned. Not called by this phase's UI (P10); exported for
 * the P11 CSV-import review flow to use.
 * @param input transaction/merchant identifiers plus suggested vs. chosen category.
 */
export async function submitAiFeedback(input: AiFeedbackInput): Promise<void> {
  await apiClient.post('/ai/feedback', input);
}
