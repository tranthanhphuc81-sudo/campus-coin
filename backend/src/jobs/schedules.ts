/**
 * schedules.ts
 * Registers the repeatable (cron) jobs from docs/spec/04 §4.5 Table 13, all in Asia/Ho_Chi_Minh
 * so "00:05 hằng ngày" etc. match the business's local day, not UTC. `upsertJobScheduler` is
 * BullMQ's idempotent API for this: calling it again on every worker restart updates the
 * existing schedule instead of creating a duplicate.
 * Main exports: registerSchedules
 * Spec: docs/spec/04 §4.5 (Table 13)
 */
import { DEFAULT_TIMEZONE } from '@campuscoin/shared';
import { cleanupExpiredQueue, insightGenerateQueue, recurringMaterializeQueue } from './queues.js';

/** Registers every repeatable job. Call once when the worker process starts. */
export async function registerSchedules(): Promise<void> {
  await recurringMaterializeQueue.upsertJobScheduler('recurring-materialize-daily', {
    pattern: '5 0 * * *',
    tz: DEFAULT_TIMEZONE,
  });
  await insightGenerateQueue.upsertJobScheduler('insight-generate-monthly', {
    pattern: '30 0 1 * *',
    tz: DEFAULT_TIMEZONE,
  });
  await cleanupExpiredQueue.upsertJobScheduler('cleanup-expired-daily', {
    pattern: '0 3 * * *',
    tz: DEFAULT_TIMEZONE,
  });
}
