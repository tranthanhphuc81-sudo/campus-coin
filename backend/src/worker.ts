/**
 * worker.ts
 * Background worker process entry point (separate from the API): one BullMQ `Worker` per queue
 * from docs/spec/04 §4.5 Table 13, the repeatable schedules, and domain-event handler
 * registration (events run in both processes; only jobs run here). Keeps the process alive and
 * closes every worker/queue/connection (BullMQ, Prisma, Redis) gracefully on SIGINT/SIGTERM.
 * Also initializes Sentry (P20, no-op unless SENTRY_DSN is set).
 * Spec: docs/spec/04 §4.5 (background jobs) · docs/spec/10 §10.5 (graceful shutdown)
 */
import { SHUTDOWN_TIMEOUT_MS } from '@campuscoin/shared';
import { Worker } from 'bullmq';
import { registerEventHandlers } from './events/index.js';
import { onJobFailed } from './jobs/jobFailed.js';
import { closeAllQueues, getBullConnection, INSIGHT_GENERATE_BACKOFF_MS, QUEUE_NAMES } from './jobs/queues.js';
import { processCleanupExpired } from './jobs/processors/cleanup-expired.processor.js';
import { processEmailSend } from './jobs/processors/email-send.processor.js';
import { processImportParse } from './jobs/processors/import-parse.processor.js';
import { processInsightGenerate } from './jobs/processors/insight-generate.processor.js';
import { processRecurringMaterialize } from './jobs/processors/recurring-materialize.processor.js';
import { processTipsRefresh } from './jobs/processors/tips-refresh.processor.js';
import { registerSchedules } from './jobs/schedules.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { redis } from './lib/redis.js';
import { closeSentry, initSentry } from './lib/sentry.js';

initSentry();

const connection = getBullConnection();

const workers = [
  new Worker(QUEUE_NAMES.EMAIL_SEND, processEmailSend, { connection }),
  new Worker(QUEUE_NAMES.RECURRING_MATERIALIZE, processRecurringMaterialize, { connection }),
  new Worker(QUEUE_NAMES.INSIGHT_GENERATE, processInsightGenerate, {
    connection,
    // Table 13: "3 lần (2s, 8s, 32s)" — a fixed schedule, not a formula, so it needs a custom strategy.
    settings: { backoffStrategy: (attemptsMade) => INSIGHT_GENERATE_BACKOFF_MS[attemptsMade - 1] ?? 32_000 },
  }),
  new Worker(QUEUE_NAMES.IMPORT_PARSE, processImportParse, { connection }),
  new Worker(QUEUE_NAMES.TIPS_REFRESH, processTipsRefresh, { connection }),
  new Worker(QUEUE_NAMES.CLEANUP_EXPIRED, processCleanupExpired, { connection }),
];

for (const worker of workers) {
  worker.on('failed', (job, err) => {
    logger.error({ err, jobId: job?.id, queue: worker.name }, '[worker] job failed');
    // Fire-and-forget: `onJobFailed` never throws (audit.service.record swallows its own errors),
    // and must never delay/interfere with BullMQ's own retry scheduling.
    void onJobFailed(worker.name, job, err);
  });
}

registerEventHandlers();

async function main(): Promise<void> {
  await registerSchedules();
  logger.info(
    { queues: workers.map((w) => w.name) },
    '[worker] started, listening on all queues',
  );
}

main().catch((err: unknown) => {
  logger.error({ err }, '[worker] failed to start');
  process.exitCode = 1;
});

let shuttingDown = false;

/**
 * Stops every worker/queue/connection; exits with code 1 if it takes longer than SHUTDOWN_TIMEOUT_MS.
 * @param signal - the OS signal that triggered the shutdown (for the log line).
 */
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, '[worker] shutting down…');

  const timer = setTimeout(() => {
    logger.error('[worker] graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  timer.unref();

  Promise.all(workers.map((w) => w.close()))
    .then(() => Promise.allSettled([closeAllQueues(), prisma.$disconnect(), redis.quit(), closeSentry()]))
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      logger.error({ err }, '[worker] error while shutting down');
      process.exit(1);
    });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
