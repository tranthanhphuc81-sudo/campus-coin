/**
 * queues.test.ts
 * Unit test for jobs/queues.ts's `emailQueue` retention settings (C-M4): completed jobs must not
 * be retained at all, and failed jobs only for 1 day / the newest 100 — each email job's data
 * includes the full rendered plaintext body (incl. reset/verify links), which used to sit in
 * Redis (persisted via AOF) for up to 1000 retained jobs. `bullmq`'s `Queue` class and the shared
 * Redis connection factory are both mocked — no real Redis connection is opened.
 * Spec: docs/security/review-p19.md C-M4
 */
import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';

const queueConstructorMock = vi.fn();
vi.mock('bullmq', () => ({
  Queue: class {
    constructor(name: string, opts: unknown) {
      queueConstructorMock(name, opts);
    }
  },
}));
vi.mock('../../../src/lib/redis.js', () => ({ createRedisClient: vi.fn().mockReturnValue({}) }));

const { emailQueue, QUEUE_NAMES } = await import('../../../src/jobs/queues.js');

interface CapturedQueueOptions {
  defaultJobOptions: { removeOnComplete: unknown; removeOnFail: unknown };
}

describe('emailQueue retention (C-M4)', () => {
  it('removes completed jobs immediately and caps failed jobs at 1 day / newest 100', () => {
    // The queue is a lazy proxy (jobs/queues.ts's createLazyQueue) — accessing any property
    // builds the real underlying `Queue` on first use.
    void emailQueue.name;

    expect(queueConstructorMock).toHaveBeenCalledTimes(1);
    const [name, opts] = queueConstructorMock.mock.calls[0] as [string, CapturedQueueOptions];
    expect(name).toBe(QUEUE_NAMES.EMAIL_SEND);
    expect(opts.defaultJobOptions.removeOnComplete).toBe(true);
    expect(opts.defaultJobOptions.removeOnFail).toEqual({ age: 86_400, count: 100 });
  });
});
