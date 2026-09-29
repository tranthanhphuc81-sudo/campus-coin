/**
 * null.provider.ts
 * No-op AI provider used when `AI_API_KEY` is empty (docs/spec/03: the app MUST work fully
 * without an AI key — rule/keyword fallback only) and in the test environment (never make a real
 * network call from the test suite).
 * Main exports: NullProvider
 * Spec: docs/spec/03 §3.2 (AI provider-agnostic, works with empty AI_API_KEY)
 */
import type { AiProvider, CategorizeRequest, CategorizeResultItem, InsightStats, InsightText } from '../types.js';

/** Always-disabled provider: tier 3 (LLM) is skipped entirely when this is active. */
export class NullProvider implements AiProvider {
  readonly name = 'null';
  readonly enabled = false;

  /** Never called in practice (the AI service checks `enabled` first), but returns an empty result defensively. */
  async categorize(_req: CategorizeRequest): Promise<CategorizeResultItem[]> {
    return [];
  }

  /** Never called in practice (`generateForUser` checks `enabled` first); always falls back to the template. */
  async writeInsight(_stats: InsightStats): Promise<InsightText | null> {
    return null;
  }
}
