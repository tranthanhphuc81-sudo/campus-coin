/**
 * email-send.processor.ts
 * Worker processor for the `email.send` queue: actually sends the mail via SMTP. This is the
 * only place `sendMail` (integrations/mailer/transport.ts) is called from — every other module
 * enqueues through `queueEmail` or `emailQueue.add` directly instead.
 * C-M4: the queue carries two job shapes. `EMAIL_JOB_NAMES.SEND` jobs already have a fully
 * rendered {@link SendMailInput}; `EMAIL_JOB_NAMES.REPORT_SHARE` jobs carry only identifiers
 * (`ReportShareJobData`) and the PDF/email body is rendered here, just-in-time, so it never sits
 * in the job's Redis-persisted data. C-L5: logs a masked recipient — a report-share recipient is a
 * third party who never consented to CampusCoin's own logging.
 * Main exports: processEmailSend, EmailSendJobData
 * Spec: docs/spec/04 §4.5 (Table 13 – email.send) · docs/security/review-p19.md C-M4, C-L5
 */
import type { Job } from 'bullmq';
import { sendMail, type SendMailInput } from '../../integrations/mailer/transport.js';
import { renderShareEmail, type ReportShareJobData } from '../../modules/reports/reports.service.js';
import { maskEmail } from '../../lib/maskEmail.js';
import { logger } from '../../lib/logger.js';
import { EMAIL_JOB_NAMES } from '../queues.js';

/** Job data accepted by the `email.send` queue, keyed by `job.name` (see {@link EMAIL_JOB_NAMES}). */
export type EmailSendJobData = SendMailInput | ReportShareJobData;

/**
 * Processes one `email.send` job: for a `report-share` job, renders the monthly PDF + email body
 * first (C-M4); for every other job name the data is already a fully-rendered {@link SendMailInput}.
 * Throwing lets BullMQ retry per Table 13.
 */
export async function processEmailSend(job: Job<EmailSendJobData>): Promise<void> {
  const mail: SendMailInput =
    job.name === EMAIL_JOB_NAMES.REPORT_SHARE ? await renderShareEmail(job.data as ReportShareJobData) : (job.data as SendMailInput);
  await sendMail(mail);
  // C-L5: never log the raw recipient address — report-share recipients in particular never
  // consented to CampusCoin's own logging/privacy policy.
  logger.info({ jobId: job.id, to: maskEmail(mail.to) }, '[jobs] email sent');
}
