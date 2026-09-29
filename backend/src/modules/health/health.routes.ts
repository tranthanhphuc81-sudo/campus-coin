/**
 * health.routes.ts
 * Liveness probe (process is up) and readiness probe (DB + Redis reachable), used by Docker
 * healthchecks, Nginx upstream checks and uptime monitors.
 * Exports: healthRouter
 * Spec: docs/spec/10 §10.5 (availability & monitoring)
 */
import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';

/** Router mounted at `/api/v1/health`. */
export const healthRouter: Router = Router();

// GET /api/v1/health/live – the process is up and the event loop answers.
healthRouter.get('/live', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

// GET /api/v1/health/ready – dependencies (MySQL, Redis) are reachable.
healthRouter.get('/ready', async (_req, res) => {
  const [db, redisCheck] = await Promise.allSettled([prisma.$queryRaw`SELECT 1`, redis.ping()]);
  const checks = { db: db.status === 'fulfilled' ? 'ok' : 'error', redis: redisCheck.status === 'fulfilled' ? 'ok' : 'error' } as const;
  const ready = checks.db === 'ok' && checks.redis === 'ok';
  res.status(ready ? 200 : 503).json({ status: ready ? 'ok' : 'error', checks });
});
