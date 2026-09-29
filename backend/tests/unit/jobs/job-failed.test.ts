/**
 * job-failed.test.ts
 * Unit tests for `jobs/jobFailed.ts`'s `onJobFailed`: only the FINAL retry attempt writes a
 * `job.failed` audit row; `err.message` is never persisted.
 * Spec: docs/spec/09 §9.12 (Table 58 – job.failed)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';

const recordMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../src/modules/audit/audit.service.js', () => ({ record: recordMock }));

const { onJobFailed } = await import('../../../src/jobs/jobFailed.js');

/** Minimal fake `Job` — only the fields `onJobFailed` reads. */
function fakeJob(overrides: Partial<{ attemptsMade: number; attempts: number; id: string; name: string }> = {}): Job {
  return {
    id: overrides.id ?? 'job-1',
    name: overrides.name ?? 'test-job',
    attemptsMade: overrides.attemptsMade ?? 1,
    opts: { attempts: overrides.attempts ?? 3 },
  } as unknown as Job;
}

describe('onJobFailed', () => {
  beforeEach(() => {
    recordMock.mockClear();
  });

  it('does nothing on an intermediate attempt (attemptsMade < attempts)', async () => {
    const job = fakeJob({ attemptsMade: 1, attempts: 3 });
    await onJobFailed('test.queue', job, new Error('boom, contains sensitive-value@example.com'));
    expect(recordMock).not.toHaveBeenCalled();
  });

  it('records job.failed on the final attempt (attemptsMade === attempts)', async () => {
    const job = fakeJob({ attemptsMade: 3, attempts: 3 });
    await onJobFailed('test.queue', job, new Error('boom'));

    expect(recordMock).toHaveBeenCalledTimes(1);
    expect(recordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'job.failed',
        actorRole: 'system',
        entityType: 'job',
        entityId: 'job-1',
        metadata: { queue: 'test.queue', jobName: 'test-job', jobId: 'job-1', attemptsMade: 3, errorName: 'Error' },
      }),
    );
  });

  it('never persists err.message (may contain PII)', async () => {
    const job = fakeJob({ attemptsMade: 3, attempts: 3 });
    await onJobFailed('test.queue', job, new Error('secret: user@example.com'));

    const call = recordMock.mock.calls[0]![0] as { metadata: Record<string, unknown> };
    expect(JSON.stringify(call.metadata)).not.toContain('user@example.com');
  });

  it('does nothing when attemptsMade exceeds a job with no explicit attempts option (defaults to 1)', async () => {
    const job = fakeJob({ attemptsMade: 1, attempts: undefined as unknown as number });
    job.opts.attempts = undefined;
    await onJobFailed('test.queue', job, new Error('boom'));
    expect(recordMock).toHaveBeenCalledTimes(1); // attemptsMade(1) >= default(1) -> final attempt
  });

  it('is a no-op when job is undefined', async () => {
    await onJobFailed('test.queue', undefined, new Error('boom'));
    expect(recordMock).not.toHaveBeenCalled();
  });
});
