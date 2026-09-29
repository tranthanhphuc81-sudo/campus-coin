/**
 * jobFailed.ts
 * Records a `job.failed` audit row (Table 58) only on a job's FINAL retry attempt — an
 * intermediate retry is normal/expected noise, not a security-relevant event. `err.message` is
 * deliberately excluded from `metadata`: a job's error message can embed request/user data (e.g. a
 * Prisma constraint message quoting a value), which must never land in the audit log
 * (docs/spec/09 §9.9 data minimisation).
 * Main exports: onJobFailed
 * Spec: docs/spec/09 §9.12 (Table 58 – job.failed) · docs/spec/04 §4.5 (background jobs)
 */
import type { Job } from 'bullmq';
import { record } from '../modules/audit/audit.service.js';

/**
 * Handler for a BullMQ `Worker`'s `'failed'` event. Writes `job.failed` only once the job has
 * exhausted every configured attempt (`job.attemptsMade >= job.opts.attempts`) — every earlier
 * attempt is silently ignored here (the worker's own `logger.error` already covers those).
 * @param queueName - Name of the queue the job belongs to (`worker.name`).
 * @param job - The failed job, or `undefined` (BullMQ's `'failed'` signature allows it).
 * @param err - The error BullMQ reports; never persisted (may contain PII — see file header).
 */
export async function onJobFailed(queueName: string, job: Job | undefined, err: Error): Promise<void> {
  if (!job) return;
  const maxAttempts = job.opts.attempts ?? 1;
  if (job.attemptsMade < maxAttempts) return; // not the final attempt yet — BullMQ will retry.

  await record({
    action: 'job.failed',
    actorRole: 'system',
    entityType: 'job',
    entityId: job.id,
    metadata: { queue: queueName, jobName: job.name, jobId: job.id, attemptsMade: job.attemptsMade, errorName: err.name },
  });
}
