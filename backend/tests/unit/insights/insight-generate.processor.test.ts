/**
 * insight-generate.processor.test.ts
 * Unit test for the `insight.generate` BullMQ processor's fan-out branch (cron-fired, empty job
 * data): it must enqueue exactly one per-user job per eligible user, with the documented jobId
 * shape, and never call the generation pipeline directly itself. `insights.repository`,
 * `insights.generate` and the queue are all mocked — no DB/Redis needed.
 * Spec: docs/spec/04 §4.5 (Table 13 – insight.generate) · docs/spec/05b §5.9
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';

const eligibleUserIdsMock = vi.fn();
vi.mock('../../../src/modules/insights/insights.repository.js', () => ({
  insightsRepository: { eligibleUserIds: eligibleUserIdsMock },
}));

const generateForUserMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../src/modules/insights/insights.generate.js', () => ({ generateForUser: generateForUserMock }));

const addMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../src/jobs/queues.js', () => ({ insightGenerateQueue: { add: addMock } }));

const { processInsightGenerate } = await import('../../../src/jobs/processors/insight-generate.processor.js');

function fakeJob(data: { userId?: string; month?: string }): Job {
  return { data } as unknown as Job;
}

describe('processInsightGenerate', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('fan-out (empty job data): enqueues one per-user job per eligible user, with the documented jobId shape', async () => {
    eligibleUserIdsMock.mockResolvedValue(['user-1', 'user-2']);

    await processInsightGenerate(fakeJob({}));

    expect(eligibleUserIdsMock).toHaveBeenCalledTimes(1);
    expect(addMock).toHaveBeenCalledTimes(2);
    expect(generateForUserMock).not.toHaveBeenCalled();

    const [name1, data1, opts1] = addMock.mock.calls[0] as [string, { userId: string; month: string }, { jobId: string }];
    expect(name1).toBe('insight-generate');
    expect(data1.userId).toBe('user-1');
    expect(opts1.jobId).toBe(`insight-user-1-${data1.month}`);

    const [, data2, opts2] = addMock.mock.calls[1] as [string, { userId: string; month: string }, { jobId: string }];
    expect(data2.userId).toBe('user-2');
    expect(opts2.jobId).toBe(`insight-user-2-${data2.month}`);
  });

  it('fan-out with no eligible users: enqueues nothing', async () => {
    eligibleUserIdsMock.mockResolvedValue([]);

    await processInsightGenerate(fakeJob({}));

    expect(addMock).not.toHaveBeenCalled();
  });

  it('per-user job (userId present): calls generateForUser directly, never touches the queue', async () => {
    await processInsightGenerate(fakeJob({ userId: 'user-1', month: '2026-08-01' }));

    expect(generateForUserMock).toHaveBeenCalledWith('user-1', '2026-08-01');
    expect(addMock).not.toHaveBeenCalled();
    expect(eligibleUserIdsMock).not.toHaveBeenCalled();
  });
});
