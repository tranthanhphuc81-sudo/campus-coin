/**
 * server.ts
 * API process entry point: starts the HTTP server and shuts it down gracefully on
 * SIGINT/SIGTERM (stop accepting connections, let in-flight requests finish, close
 * Prisma/Redis/BullMQ, force exit after SHUTDOWN_TIMEOUT_MS). Also initializes Sentry (P20,
 * no-op unless SENTRY_DSN is set). In dev the root .env is loaded by `tsx --env-file-if-exists`;
 * `config` (Zod-validated, config/env.ts) is the only place that reads `process.env`.
 * Port: API_PORT (default 3000) – replaces spec's PORT so it cannot clash with WEB_PORT.
 * Spec: docs/spec/10 §10.5 (availability) · §11.3 (environment configuration)
 */
import { createServer } from 'node:http';
import { SHUTDOWN_TIMEOUT_MS } from '@campuscoin/shared';
import { createApp } from './app.js';
import { config } from './config/env.js';
import { registerEventHandlers } from './events/index.js';
import { closeAllQueues } from './jobs/queues.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { redis } from './lib/redis.js';
import { closeSentry, initSentry } from './lib/sentry.js';

initSentry();

const port = config.app.port;
const server = createServer(createApp());
registerEventHandlers();

// Fail with a clear, actionable message instead of a raw stack trace when the port is taken.
server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    logger.error(`[api] port ${port} is already in use – set API_PORT in .env to a free port`);
  } else {
    logger.error({ err }, '[api] server error');
  }
  process.exit(1);
});

server.listen(port, () => {
  logger.info(`[api] listening on http://localhost:${port}`);
});

let shuttingDown = false;

/**
 * Stop the server gracefully; exits with code 1 if it takes longer than SHUTDOWN_TIMEOUT_MS.
 * @param signal - the OS signal that triggered the shutdown (for the log line).
 */
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, '[api] shutting down…');

  // unref() so this timer alone never keeps the process alive after a clean close.
  setTimeout(() => {
    logger.error('[api] graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();

  server.close((err) => {
    if (err) {
      logger.error({ err }, '[api] error while closing server');
      process.exit(1);
    }
    // Best-effort: an in-flight request that still needs these must already have finished for
    // server.close()'s callback to fire, so closing here never cuts off a live query.
    Promise.allSettled([prisma.$disconnect(), redis.quit(), closeAllQueues(), closeSentry()])
      .catch(() => undefined)
      .finally(() => process.exit(0));
  });
  // Close idle keep-alive sockets so close() does not wait for them.
  server.closeIdleConnections();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
