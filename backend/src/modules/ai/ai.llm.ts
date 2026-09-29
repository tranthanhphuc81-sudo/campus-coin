/**
 * ai.llm.ts
 * DB/Redis-free tier-3 (LLM) classification helper — shared by `ai.service.ts` (real requests,
 * quota/cache-aware) and `tests/eval/ai-eval.ts` (quality measurement, no quota/cache). Chunks a
 * flat list of texts into `AI_BATCH_SIZE`-sized provider calls and maps results back by index.
 * Main exports: classifyWithLlm, LlmClassification
 * Spec: docs/spec/05b §5.6 (AI categorization, tier 3) · Rules: D5 (confidence floor)
 */
import { AI_BATCH_SIZE, AI_LLM_CONFIDENCE_MIN, type TransactionType } from '@campuscoin/shared';
import type { AiProvider } from '../../integrations/ai/index.js';

/** One tier-3 classification result. */
export interface LlmClassification {
  category: string;
  confidence: number;
}

/** Options accepted by {@link classifyWithLlm}. */
export interface ClassifyWithLlmOptions {
  timeoutMs?: number;
}

/**
 * Classifies a flat list of texts against `allowedNames`, in chunks of {@link AI_BATCH_SIZE}.
 * @param provider - The AI provider to call (already resilience-wrapped).
 * @param type - Transaction type (income/expense) shared by every text in this call.
 * @param allowedNames - Category names the provider is allowed to answer with.
 * @param texts - Sanitised-by-the-provider (not here) description texts, in order.
 * @param opts - Optional per-call timeout override (D7: batch vs interactive).
 * @returns One entry per input text, in the same order: `null` when the provider omitted that
 *   index or its confidence fell below {@link AI_LLM_CONFIDENCE_MIN} (D5).
 * @throws whatever the provider throws (e.g. `AiProviderError`) — this function does not catch;
 *   callers decide how to isolate a failing chunk from the rest.
 */
export async function classifyWithLlm(
  provider: AiProvider,
  type: TransactionType,
  allowedNames: string[],
  texts: string[],
  opts: ClassifyWithLlmOptions = {},
): Promise<Array<LlmClassification | null>> {
  const results: Array<LlmClassification | null> = new Array(texts.length).fill(null);

  for (let offset = 0; offset < texts.length; offset += AI_BATCH_SIZE) {
    const chunk = texts.slice(offset, offset + AI_BATCH_SIZE);
    const items = chunk.map((text, index) => ({ index, text }));
    const chunkResults = await provider.categorize({ type, categories: allowedNames, items, timeoutMs: opts.timeoutMs });

    for (const item of chunkResults) {
      if (item.confidence < AI_LLM_CONFIDENCE_MIN) continue;
      results[offset + item.index] = { category: item.category, confidence: item.confidence };
    }
  }

  return results;
}
