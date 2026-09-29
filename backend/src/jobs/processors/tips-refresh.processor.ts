/**
 * tips-refresh.processor.ts
 * Worker processor for the `tips.refresh` queue: recomputes and ranks a user's savings tips for
 * the current month (docs/spec/05b §5.10). Errors are left to propagate so BullMQ's 2-attempt
 * retry (`jobs/queues.ts`) kicks in — never swallow a genuine failure here.
 * Main exports: processTipsRefresh, TipsRefreshJobData
 * Spec: docs/spec/04 §4.5 (Table 13 – tips.refresh) · docs/spec/05b §5.10 (tips engine)
 */
import type { Job } from 'bullmq';
import { refreshForUser } from '../../modules/tips/tips.service.js';

/** Payload of a `tips.refresh` job (see `events/handlers/tips-refresher.handler.ts`). */
export interface TipsRefreshJobData {
  userId: string;
}

/** Processes one `tips.refresh` run: recompute and rank `job.data.userId`'s tips. */
export async function processTipsRefresh(job: Job<TipsRefreshJobData>): Promise<void> {
  await refreshForUser(job.data.userId);
}
