/**
 * ai-learning.handler.ts
 * When a user picks/corrects a category on a manually-saved transaction, updates that user's
 * tier-1 personal rule (`ai_category_rules`) so future suggestions improve. Idempotent per
 * transaction version (a `SET NX` guard) so replaying the same event, or a direct `/ai/feedback`
 * call for the same edit, never double-counts.
 * Main exports: handleAiLearning, registerAiLearningHandler
 * Spec: docs/spec/04 §4.6 · docs/spec/05b §5.6 (AI categorization – tier 1 personal rules)
 */
import { AI_LEARNED_DEDUPE_TTL_SEC, CategorySource, TransactionSource } from '@campuscoin/shared';
import { markOnceOrProceed } from '../../lib/cache.js';
import { aiLearnedKey } from '../../lib/cacheKeys.js';
import { aiRulesRepository } from '../../modules/ai/ai.repository.js';
import type { TransactionEventPayload } from '../bus.js';
import { on } from '../bus.js';

/** `categorySource` values that represent an explicit user choice worth learning from. */
const LEARNABLE_CREATE_SOURCES: ReadonlySet<string> = new Set([CategorySource.USER, CategorySource.AI_OVERRIDDEN, CategorySource.RULE]);

/**
 * Handles one `transaction.created`/`transaction.updated` event: learns a tier-1 rule when it
 * represents a manual, explicit category choice.
 * - `created`: learn when `source === 'manual'` and `categorySource` is `user`/`ai_overridden`/
 *   `rule` (a `rule` match is reinforced to strong confidence; `ai_accepted` is a no-op — the
 *   suggestion was already correct, nothing new to learn).
 * - `updated`: learn when the category actually changed AND `categorySource` is `user`/
 *   `ai_overridden` (no `source` filter here — only a user can PATCH a transaction, recurring/
 *   import sources are never updated by a human through this path).
 * Exported directly so tests can call it without going through the async event bus.
 */
export async function handleAiLearning(event: 'created' | 'updated', payload: TransactionEventPayload): Promise<void> {
  if (!payload.merchantKey) return;

  const isLearnableCreate = event === 'created' && payload.source === TransactionSource.MANUAL && LEARNABLE_CREATE_SOURCES.has(payload.categorySource);
  const categoryChanged = payload.previous !== undefined && payload.previous.categoryId !== payload.categoryId;
  const isLearnableUpdate =
    event === 'updated' &&
    categoryChanged &&
    (payload.categorySource === CategorySource.USER || payload.categorySource === CategorySource.AI_OVERRIDDEN);

  if (!isLearnableCreate && !isLearnableUpdate) return;

  const canProceed = await markOnceOrProceed(aiLearnedKey(payload.transactionId, payload.version), AI_LEARNED_DEDUPE_TTL_SEC);
  if (!canProceed) return; // already learned from this exact transaction version.

  await aiRulesRepository.applyUserChoice(payload.userId, payload.merchantKey, payload.categoryId);
}

/** Subscribes the AI-learning handler to `transaction.created`/`transaction.updated` only. */
export function registerAiLearningHandler(): void {
  on('transaction.created', (payload) => handleAiLearning('created', payload));
  on('transaction.updated', (payload) => handleAiLearning('updated', payload));
}
