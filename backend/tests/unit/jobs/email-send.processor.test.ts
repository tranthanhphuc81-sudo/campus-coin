/**
 * email-send.processor.test.ts
 * Unit tests for the `email.send` BullMQ processor (C-M4, C-L5): a `send` job is sent as-is; a
 * `report-share` job is rendered just-in-time via `reports.service.renderShareEmail` instead of
 * carrying a pre-rendered body/attachment. The sent-email log line must never contain the raw
 * recipient address (C-L5) — `sendMail`, `renderShareEmail` and the logger are all mocked, no
 * DB/Redis/SMTP needed.
 * Spec: docs/spec/04 §4.5 (Table 13 – email.send) · docs/security/review-p19.md C-M4, C-L5
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';

const sendMailMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../src/integrations/mailer/transport.js', () => ({ sendMail: sendMailMock }));

const renderShareEmailMock = vi.fn();
vi.mock('../../../src/modules/reports/reports.service.js', () => ({ renderShareEmail: renderShareEmailMock }));

const logInfoMock = vi.fn();
vi.mock('../../../src/lib/logger.js', () => ({ logger: { info: logInfoMock } }));

const { processEmailSend } = await import('../../../src/jobs/processors/email-send.processor.js');
const { EMAIL_JOB_NAMES } = await import('../../../src/jobs/queues.js');

/** A fake BullMQ Job with just the fields the processor reads. */
function fakeJob(name: string, data: unknown, id = 'job-1'): Job {
  return { id, name, data } as unknown as Job;
}

describe('processEmailSend', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("a 'send' job's data is passed straight through to sendMail unchanged", async () => {
    const mail = { to: 'student@example.com', subject: 'Hi', html: '<p>hi</p>', text: 'hi' };

    await processEmailSend(fakeJob(EMAIL_JOB_NAMES.SEND, mail));

    expect(renderShareEmailMock).not.toHaveBeenCalled();
    expect(sendMailMock).toHaveBeenCalledWith(mail);
  });

  it("C-M4: a 'report-share' job is rendered via renderShareEmail instead of using job.data directly", async () => {
    const jobData = { userId: 'user-1', month: '2026-09-01', toEmail: 'parent@example.com', message: 'FYI' };
    const rendered = {
      to: 'parent@example.com',
      subject: 'Shared report',
      html: '<p>report</p>',
      text: 'report',
      attachments: [{ filename: 'report.pdf', contentBase64: 'base64', contentType: 'application/pdf' }],
    };
    renderShareEmailMock.mockResolvedValue(rendered);

    await processEmailSend(fakeJob(EMAIL_JOB_NAMES.REPORT_SHARE, jobData));

    expect(renderShareEmailMock).toHaveBeenCalledWith(jobData);
    expect(sendMailMock).toHaveBeenCalledWith(rendered);
  });

  it('C-L5: never logs the raw recipient address, only a masked one', async () => {
    const mail = { to: 'student@example.com', subject: 'Hi', html: '<p>hi</p>', text: 'hi' };

    await processEmailSend(fakeJob(EMAIL_JOB_NAMES.SEND, mail, 'job-42'));

    expect(logInfoMock).toHaveBeenCalledTimes(1);
    const [logObject] = logInfoMock.mock.calls[0] as [{ jobId: string; to: string }];
    expect(logObject.jobId).toBe('job-42');
    expect(logObject.to).not.toBe('student@example.com');
    expect(logObject.to).not.toContain('student@example.com');
    expect(logObject.to).toBe('st***@example.com');
  });
});
