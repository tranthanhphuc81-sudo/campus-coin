/**
 * ai.repository.ts
 * Prisma access for tier-1 personal categorization rules (`ai_category_rules`). Every method takes
 * `userId` and scopes by it (CLAUDE.md: never trust client params for ownership) — a rule owned by
 * another user is simply never matched.
 * Main exports: aiRulesRepository
 * Spec: docs/spec/05b §5.6 (AI categorization, tier 1) · Rules: D4
 */
import { AI_RULE_REPLACE_AFTER } from '@campuscoin/shared';
import { Prisma } from '../../generated/prisma/client.js';
import type { AiCategoryRuleModel } from '../../generated/prisma/models/AiCategoryRule.js';
import type { AppPrismaClient } from '../../lib/prisma.js';
import { prisma } from '../../lib/prisma.js';
import { nextRuleAction, type RuleAction } from './ai.rules.js';

/** Either the shared client or a transaction handle — every method accepts both. */
export type Db = AppPrismaClient | Prisma.TransactionClient;

/** Applies one already-decided {@link RuleAction} to an existing rule row, inside `tx`. */
async function applyAction(
  tx: Prisma.TransactionClient,
  rule: { id: number; categoryId: number },
  action: RuleAction,
  chosenCategoryId: number,
  now: Date,
): Promise<void> {
  if (action.op === 'reinforce') {
    await tx.aiCategoryRule.updateMany({
      where: { id: rule.id },
      data: { hitCount: { increment: 1 }, lastUsedAt: now, pendingCategoryId: null },
    });
  } else if (action.op === 'setPending') {
    // Conditional where guards a concurrent edit between the read and this write (same defensive
    // pattern as transactions.repository.ts's updateVersioned).
    await tx.aiCategoryRule.updateMany({
      where: { id: rule.id, categoryId: rule.categoryId },
      data: { pendingCategoryId: chosenCategoryId, lastUsedAt: now },
    });
  } else if (action.op === 'replace') {
    await tx.aiCategoryRule.updateMany({
      where: { id: rule.id, pendingCategoryId: chosenCategoryId },
      data: { categoryId: chosenCategoryId, hitCount: AI_RULE_REPLACE_AFTER, pendingCategoryId: null, lastUsedAt: now },
    });
  }
}

export const aiRulesRepository = {
  /** The caller's rule for one merchant key, or `null`. */
  findByMerchantKey(userId: string, merchantKey: string, db: Db = prisma): Promise<AiCategoryRuleModel | null> {
    return db.aiCategoryRule.findUnique({ where: { userId_merchantKey: { userId, merchantKey } } });
  },

  /** The caller's rules for a set of merchant keys (tier-1 lookup for `suggestBatch`, P11). */
  findManyByMerchantKeys(userId: string, merchantKeys: string[], db: Db = prisma): Promise<AiCategoryRuleModel[]> {
    if (merchantKeys.length === 0) return Promise.resolve([]);
    return db.aiCategoryRule.findMany({ where: { userId, merchantKey: { in: merchantKeys } } });
  },

  /**
   * Updates (or creates) the caller's rule for `merchantKey` to reflect a user's category choice
   * (D4: two consecutive identical corrections replace the rule outright). Runs in its own
   * `$transaction`; a `create` that races another concurrent request (UNIQUE violation) is retried
   * once as an update against whatever now exists.
   * @param userId - Owning user.
   * @param merchantKey - Already-normalised merchant key (see `lib/merchantKey.ts`).
   * @param chosenCategoryId - The category the user picked/confirmed.
   * @param now - Injectable clock for tests.
   */
  async applyUserChoice(userId: string, merchantKey: string, chosenCategoryId: number, now: Date = new Date()): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.aiCategoryRule.findUnique({ where: { userId_merchantKey: { userId, merchantKey } } });
      const action = nextRuleAction(existing ? { categoryId: existing.categoryId, pendingCategoryId: existing.pendingCategoryId } : null, chosenCategoryId);

      if (action.op === 'create') {
        try {
          await tx.aiCategoryRule.create({ data: { userId, merchantKey, categoryId: chosenCategoryId, hitCount: 1, lastUsedAt: now } });
        } catch (err) {
          if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') throw err;
          const raced = await tx.aiCategoryRule.findUnique({ where: { userId_merchantKey: { userId, merchantKey } } });
          if (raced) {
            const racedAction = nextRuleAction({ categoryId: raced.categoryId, pendingCategoryId: raced.pendingCategoryId }, chosenCategoryId);
            await applyAction(tx, raced, racedAction, chosenCategoryId, now);
          }
        }
        return;
      }

      // action is only ever non-'create' when `existing` is set (nextRuleAction's own contract).
      if (existing) await applyAction(tx, existing, action, chosenCategoryId, now);
    });
  },
};
