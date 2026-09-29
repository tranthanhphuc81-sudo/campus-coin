/**
 * insight-generate.processor.ts
 * Worker processor for the `insight.generate` queue: computes a user's monthly AI/template
 * insight. Two job shapes share this one queue (an architect review's explicit recommendation over
 * looping every user in a single job — an LLM call costs money per user, and one slow/failing user
 * must never block or retry everyone else's): a cron-fired FAN-OUT job (empty `job.data`) that
 * enqueues one per-user job per eligible user, and a per-user job that does the real work. Each
 * per-user job's own BullMQ retry (2s/8s/32s, see `worker.ts`) is independent of every other job.
 * Main exports: processInsightGenerate
 * Spec: docs/spec/04 §4.5 (Table 13 – insight.generate) · docs/spec/05b §5.9 (monthly insights)
 */
import type { Job } from 'bullmq';
import { DEFAULT_TIMEZONE } from '@campuscoin/shared';
import { generateForUser } from '../../modules/insights/insights.generate.js';
import { insightsRepository } from '../../modules/insights/insights.repository.js';
import { addDays, firstDayOfMonth, todayInTimeZone } from '../../lib/dates.js';
import { logger } from '../../lib/logger.js';
import { insightGenerateQueue } from '../queues.js';

/** Data carried by one `insight.generate` job: empty for the cron fan-out, `{userId, month}` for a per-user run. */
export interface InsightGenerateJobData {
  userId?: string;
  month?: string;
}

/** Processes one `insight.generate` job — either the monthly fan-out or one user's actual generation. */
export async function processInsightGenerate(job: Job<InsightGenerateJobData>): Promise<void> {
  if (!job.data.userId) {
    // Fan-out: cron-fired with empty data (see schedules.ts, day 1 00:30) — analyse the month that
    // JUST ended (today is the 1st, so "yesterday" is always the last day of the analysed month).
    const month = firstDayOfMonth(addDays(todayInTimeZone(DEFAULT_TIMEZONE), -1));
    const userIds = await insightsRepository.eligibleUserIds(month);
    for (const userId of userIds) {
      await insightGenerateQueue.add('insight-generate', { userId, month }, { jobId: `insight-${userId}-${month}` });
    }
    logger.info({ month, count: userIds.length }, '[insight-generate] fan-out queued');
    return;
  }

  // Per-user: do the real work. Fan-out creates one job per user, so a failure/retry here only
  // ever affects this one user's own job — no batch-level try/catch needed (unlike
  // recurring-materialize.processor.ts, which processes many rules inside a single job run).
  await generateForUser(job.data.userId, job.data.month!);
}
