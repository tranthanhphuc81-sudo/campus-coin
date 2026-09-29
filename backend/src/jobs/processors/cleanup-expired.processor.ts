/**
 * cleanup-expired.processor.ts
 * Worker processor for the `cleanup.expired` queue: deletes expired auth/refresh tokens, expires
 * (and eventually hard-deletes) stale import batches, permanently erases soft-deleted transactions
 * older than 30 days, purges accounts past their 30-day deletion grace period, and archives old
 * audit-log rows to disk. All the actual work lives in `modules/cleanup/cleanup.service.ts`.
 * Main exports: processCleanupExpired
 * Spec: docs/spec/04 §4.5 (Table 13 – cleanup.expired) · docs/spec/09 §9.14 (data lifecycle)
 */
import type { Job } from 'bullmq';
import { runCleanupExpired, type CleanupSummary } from '../../modules/cleanup/cleanup.service.js';

/** Processes one `cleanup.expired` run; the summary becomes the BullMQ job's result. */
export async function processCleanupExpired(_job: Job): Promise<CleanupSummary> {
  return runCleanupExpired({ now: new Date() });
}
