/**
 * mailer.service.ts
 * Public entry point every other module uses to send email: enqueues onto `email.send`
 * (jobs/queues.ts) instead of calling SMTP directly, so a slow/down mail server never blocks a
 * request and BullMQ retries on failure (docs/spec/04 §4.5 Table 13).
 * Main exports: queueEmail, QueueEmailInput
 * Spec: docs/spec/04 §4.5 (Table 13 – email.send) · §4.2 (integrations)
 */
import { emailQueue } from '../../jobs/queues.js';
import type { SendMailInput } from './transport.js';

export interface QueueEmailInput extends SendMailInput {
  /**
   * BullMQ jobId for dedup (Table 13: "jobId = mục đích + tokenId"), e.g. `verify-email-{tokenId}`.
   * Never use `:` as the separator unless the whole id splits into exactly 3 `:`-parts — the
   * installed `bullmq` (6.3.9) rejects any custom jobId containing `:` that doesn't (reserved for
   * its own internal repeatable-job id shape); every mocked test misses this, so a bad jobId here
   * only ever surfaces against a *real* queue. A plain hyphen (or any non-`:` separator) is safest.
   */
  jobId: string;
}

/** Enqueues an email to be sent by the `email.send` worker. Never sends synchronously. */
export async function queueEmail(input: QueueEmailInput): Promise<void> {
  const { jobId, ...mail } = input;
  await emailQueue.add('send', mail, { jobId });
}
