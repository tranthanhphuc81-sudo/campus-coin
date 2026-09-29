/**
 * insights.generate.ts
 * The actual monthly-insight generation pipeline (docs/spec/05b §5.9): gathers backend-computed
 * stats, tries the LLM (gated behind `aiOptIn` + `provider.enabled` + the daily LLM quota — the
 * same gate `ai.service.ts`'s `suggest()` uses for tier 3), falls back to a deterministic template
 * on any AI failure, and persists the result. Used by both the cron fan-out and a user "regenerate"
 * call — both go through the same `insight.generate` BullMQ job, one job per user.
 * Main exports: generateForUser
 * Spec: docs/spec/05b §5.9 · docs/spec/04 §4.5 (Table 13 – insight.generate)
 */
import { NotificationType } from '@campuscoin/shared';
import { config } from '../../config/env.js';
import { UserStatus } from '../../generated/prisma/enums.js';
import { AiProviderError, getAiProvider } from '../../integrations/ai/index.js';
import type { InsightText } from '../../integrations/ai/types.js';
import { PROMPT_VERSION as INSIGHT_PROMPT_VERSION } from '../../integrations/ai/prompts/insight.v1.js';
import { cacheDel } from '../../lib/cache.js';
import { dashboardKey } from '../../lib/cacheKeys.js';
import type { LocalDate } from '../../lib/dates.js';
import { logger } from '../../lib/logger.js';
import { isAiOptedIn } from '../ai/ai.service.js';
import { tryConsumeLlmQuota } from '../ai/ai.quota.js';
import * as notificationsService from '../notifications/notifications.service.js';
import { usersRepository } from '../users/users.repository.js';
import { buildTemplateInsight } from './insight.template.js';
import { insightsRepository } from './insights.repository.js';
import { buildInsightSnapshot, toInsightStatsForPrompt } from './insights.stats.js';

/**
 * Generates (or regenerates) one user's insight for `month`. Any unhandled error (DB, etc — NOT an
 * `AiProviderError`, which is already handled internally by falling back to the template) marks
 * the row `failed` and RETHROWS, so the BullMQ job retries (2s/8s/32s) — mirrors
 * `recurring-materialize.processor.ts`'s per-item error handling shape.
 * @param userId - The user to generate for.
 * @param month - First day of the analysed month (already normalised by the caller).
 */
export async function generateForUser(userId: string, month: LocalDate): Promise<void> {
  let insightId: number | undefined;
  try {
    const user = await usersRepository.findById(userId);
    if (!user || user.status !== UserStatus.active) {
      logger.warn({ userId, month }, '[insights] skipping generation: user missing or inactive');
      return;
    }

    const [totals, categories, largestExpense, hasAnyPriorMonthHistory] = await Promise.all([
      insightsRepository.totalsForMonth(userId, month),
      insightsRepository.expenseCategoryStats(userId, month),
      insightsRepository.largestExpenseThisMonth(userId, month),
      insightsRepository.hasAnyPriorMonthHistory(userId, month),
    ]);

    const snapshot = buildInsightSnapshot({
      month,
      currency: user.currency,
      allowanceBaseline: user.monthlyAllowanceBaseline,
      totalIncome: totals.income,
      totalExpense: totals.expense,
      categories,
      largestExpense,
      hasAnyPriorMonthHistory,
    });

    const row = await insightsRepository.upsertQueued(userId, month);
    insightId = row.id;
    await insightsRepository.setProcessing(row.id);

    let text: InsightText | null = null;
    let generator: 'llm' | 'template' = 'template';
    let model: string | null = null;
    let promptVersion: string | null = null;

    // Mirrors `ai.service.ts`'s `suggest()` tier-3 gate exactly: opt-in + a real (non-Null)
    // provider + the shared daily LLM quota. AI failure of any kind must never block saving the
    // insight — it only ever falls through to the deterministic template below.
    const provider = getAiProvider();
    if (user.aiOptIn && provider.enabled && (await tryConsumeLlmQuota(userId))) {
      try {
        const stats = toInsightStatsForPrompt(snapshot, month, user.currency, totals.income, totals.expense);
        // Security fix (Low): several aggregate DB queries ran above between the `user` read at the
        // top of this function and this point — re-check the opt-in/active status fresh, right
        // before the actual LLM call, via the same helper `ai.service.ts`'s tier-3 gate uses (§9.14:
        // an opt-out/disable during those queries must still be caught). Falls back to the template
        // below, same as any other AI failure — never blocks saving the insight.
        const llmText = (await isAiOptedIn(userId)) ? await provider.writeInsight(stats) : null;
        if (llmText) {
          text = llmText;
          generator = 'llm';
          model = config.ai.model;
          promptVersion = INSIGHT_PROMPT_VERSION;
        }
      } catch (err) {
        if (!(err instanceof AiProviderError)) throw err;
        logger.warn({ userId, month, kind: err.kind }, '[insights] LLM write failed, falling back to template');
      }
    }

    if (!text) {
      text = buildTemplateInsight(snapshot, user.currency);
      generator = 'template';
      model = null;
      promptVersion = null;
    }

    await insightsRepository.setCompleted(row.id, {
      summaryText: text.summaryText,
      tipText: text.tipText,
      flaggedPatterns: snapshot.flaggedPatterns,
      // Kept only for debugging/reproduction — never read back structurally, so plain
      // string-ified Decimals are fine here (unlike the DTO, which must round/format precisely).
      statsSnapshot: {
        month,
        currency: user.currency,
        totalIncome: totals.income.toString(),
        totalExpense: totals.expense.toString(),
        // Not its own DB column — persisted here so `insights.service.ts`'s `toInsightDto` can read
        // it back for the API's `savingsRatePct` field.
        savingsRatePct: snapshot.savingsRatePct,
        allowanceBaseline: user.monthlyAllowanceBaseline?.toString() ?? null,
        categories: categories.map((c) => ({
          categoryId: c.categoryId,
          categoryName: c.categoryName,
          cur: c.cur.toString(),
          priorMonths: c.priorMonths.map((v) => v?.toString() ?? null),
          budgetLimit: c.budgetLimit?.toString() ?? null,
        })),
        largestExpense: largestExpense ? { categoryName: largestExpense.categoryName, amount: largestExpense.amount.toString() } : null,
        hasAnyPriorMonthHistory,
      },
      generator,
      model,
      promptVersion,
    });

    // BR (review fix): dedupeKey is suffixed with the row's OWN regenerateCount (as it stood when
    // this run started, i.e. the slot `regenerateAtomic`/the cron fan-out already claimed) — a
    // fixed `insight_ready:${month}` key would mean a regenerate never notifies again.
    await notificationsService.notify(userId, {
      type: NotificationType.INSIGHT_READY,
      title: `Your ${month} insight is ready`,
      body: text.summaryText.slice(0, 140),
      dedupeKey: `insight_ready-${month}-${row.regenerateCount}`,
    });

    // Bust the dashboard cache so the new insight shows up without waiting for the 60s TTL — on
    // both the LLM and template-fallback paths.
    await cacheDel(dashboardKey(userId, month));
  } catch (err) {
    if (insightId !== undefined) {
      await insightsRepository.setFailed(insightId).catch((setFailedErr: unknown) => {
        logger.error({ err: setFailedErr, insightId }, '[insights] failed to mark row failed');
      });
    }
    logger.error({ err, userId, month }, '[insights] generation failed');
    throw err;
  }
}
