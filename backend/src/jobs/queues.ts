/**
 * queues.ts
 * The 6 BullMQ queues from docs/spec/04 §4.5 Table 13 (the 7th row, `backup.database`, is an OS
 * cron job, not a queue). Each queue is a lazy proxy — importing this module never opens a Redis
 * connection; the connection is created on the first `.add()`/`.getJobs()`/etc call, mirroring
 * lib/prisma.ts and lib/redis.ts. Producers (services) only ever call `.add()` here; consumers
 * (Worker instances + processors) are wired up in worker.ts.
 * Main exports: QUEUE_NAMES, EMAIL_JOB_NAMES, emailQueue, recurringMaterializeQueue,
 *               insightGenerateQueue, importParseQueue, tipsRefreshQueue, cleanupExpiredQueue,
 *               INSIGHT_GENERATE_BACKOFF_MS, getBullConnection, closeAllQueues
 * Spec: docs/spec/04 §4.5 (Table 13 – background jobs) · docs/security/review-p19.md C-M4
 */
import { Queue, type QueueOptions } from 'bullmq';
import type { Redis } from 'ioredis';
import { createRedisClient } from '../lib/redis.js';

/** BullMQ queue names, exactly as spelled in Table 13. */
export const QUEUE_NAMES = {
  EMAIL_SEND: 'email.send',
  RECURRING_MATERIALIZE: 'recurring.materialize',
  INSIGHT_GENERATE: 'insight.generate',
  IMPORT_PARSE: 'import.parse',
  TIPS_REFRESH: 'tips.refresh',
  CLEANUP_EXPIRED: 'cleanup.expired',
} as const;
export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/**
 * Job names within the `email.send` queue (one queue, two job shapes). `SEND` carries an
 * already-rendered {@link SendMailInput}; `REPORT_SHARE` carries only identifiers/references
 * (`{userId, month, toEmail, message}`) — the worker renders the monthly PDF just-in-time so the
 * multi-hundred-KB attachment is never persisted in the BullMQ job payload in Redis (C-M4).
 */
export const EMAIL_JOB_NAMES = { SEND: 'send', REPORT_SHARE: 'report-share' } as const;

/** insight.generate's custom retry delays (Table 13: "3 lần (2s, 8s, 32s)"); consumed by the Worker in worker.ts. */
export const INSIGHT_GENERATE_BACKOFF_MS = [2000, 8000, 32_000] as const;

// Cache on globalThis so `tsx watch` reloads do not open a new connection on every restart.
const globalForQueues = globalThis as unknown as { __campuscoinBullConnection?: Redis };

/** Shared ioredis connection for all BullMQ queues/workers (BullMQ requires `maxRetriesPerRequest: null`). */
export function getBullConnection(): Redis {
  globalForQueues.__campuscoinBullConnection ??= createRedisClient({ maxRetriesPerRequest: null });
  return globalForQueues.__campuscoinBullConnection;
}

/** Wraps `new Queue(name, ...)` in a lazy proxy: the queue (and its connection) is only built on first use. */
function createLazyQueue(name: QueueName, defaultJobOptions?: QueueOptions['defaultJobOptions']): Queue {
  let instance: Queue | undefined;
  const get = (): Queue => (instance ??= new Queue(name, { connection: getBullConnection(), defaultJobOptions }));
  return new Proxy({} as Queue, {
    get(_target, prop) {
      const queue = get();
      const value: unknown = Reflect.get(queue, prop, queue);
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(queue) : value;
    },
  });
}

/**
 * Triggered by: registration, password reset, verification, report sharing. Retry: 5x exponential.
 * C-M4: every email job's data includes the fully-rendered plaintext body (incl. reset/verify
 * links) — retaining 1000 completed + 1000 failed jobs let that sit in Redis (persisted via AOF)
 * long after the job finished. `removeOnComplete: true` drops completed jobs immediately;
 * `removeOnFail` keeps failed ones only 1 day (or the newest 100, whichever is smaller) so a
 * failure is still inspectable for a while without unbounded retention.
 */
export const emailQueue = createLazyQueue(QUEUE_NAMES.EMAIL_SEND, {
  attempts: 5,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: true,
  removeOnFail: { age: 86_400, count: 100 },
});

/** Triggered by: daily scheduler (00:05). Retry: 3x exponential. Idempotency: caller sets jobId. */
export const recurringMaterializeQueue = createLazyQueue(QUEUE_NAMES.RECURRING_MATERIALIZE, {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { count: 200 },
  removeOnFail: { count: 500 },
});

/** Triggered by: monthly scheduler (day 1, 00:30) or user "regenerate". Retry: 2s/8s/32s (custom, see worker.ts). */
export const insightGenerateQueue = createLazyQueue(QUEUE_NAMES.INSIGHT_GENERATE, {
  attempts: 3,
  backoff: { type: 'custom' },
  removeOnComplete: { count: 500 },
  removeOnFail: { count: 500 },
});

/** Triggered by: CSV upload. Retry: none (a failed parse must be re-uploaded). Idempotency: caller sets jobId. */
export const importParseQueue = createLazyQueue(QUEUE_NAMES.IMPORT_PARSE, {
  attempts: 1,
  removeOnComplete: { count: 200 },
  removeOnFail: { count: 500 },
});

/** Triggered by: transaction events, debounced 5 min/user. Retry: 2x exponential. Idempotency: caller sets jobId. */
export const tipsRefreshQueue = createLazyQueue(QUEUE_NAMES.TIPS_REFRESH, {
  attempts: 2,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { count: 200 },
  removeOnFail: { count: 200 },
});

/** Triggered by: daily scheduler (03:00). Retry: 3x exponential. */
export const cleanupExpiredQueue = createLazyQueue(QUEUE_NAMES.CLEANUP_EXPIRED, {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { count: 30 },
  removeOnFail: { count: 100 },
});

const ALL_QUEUES = [
  emailQueue,
  recurringMaterializeQueue,
  insightGenerateQueue,
  importParseQueue,
  tipsRefreshQueue,
  cleanupExpiredQueue,
];

/** Closes every queue and the shared BullMQ Redis connection (graceful shutdown). */
export async function closeAllQueues(): Promise<void> {
  await Promise.all(ALL_QUEUES.map((q) => q.close()));
  await getBullConnection().quit();
}
