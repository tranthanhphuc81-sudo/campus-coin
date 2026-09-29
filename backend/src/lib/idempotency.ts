/**
 * idempotency.ts
 * Middleware that makes a request safe to retry: when the client sends an `Idempotency-Key`
 * header, the first response is cached in Redis for 24h and replayed verbatim on any repeat with
 * the same key — used by POST /transactions and POST /imports/{id}/commit so a flaky network
 * never double-creates a resource. If the request has no `Idempotency-Key`, this is a no-op. If
 * Redis is unavailable, the request is processed normally instead of failing (graceful
 * degradation, docs/spec/10 §10.5).
 * B-L4: the cache key is derived from caller + `method` + `path` + `sha256(body)` + the client's
 * own key — not the client's key alone — so reusing one `Idempotency-Key` header value across two
 * different requests (different route, or a different body on a retry) is never mistaken for a
 * replay of the first. A short-lived `SET NX` "in-flight" marker also rejects a second concurrent
 * request using the same key while the first is still being processed (409), instead of letting
 * both run and double-write.
 * Main exports: idempotency
 * Spec: docs/spec/07 §7.1 (Table 40 – Idempotency)
 */
import { createHash } from 'node:crypto';
import type { Request, RequestHandler, Response } from 'express';
import { conflict, validationFailed } from './problem.js';
import { logger } from './logger.js';
import { redis } from './redis.js';

const CACHE_TTL_SECONDS = 24 * 60 * 60;
/** How long the "request in flight" marker survives before it is treated as abandoned (B-L4). */
const IN_FLIGHT_TTL_MS = 30_000;
const HEADER = 'idempotency-key';
/** Client-supplied key format: reject anything else with 422 rather than silently using it. */
const KEY_FORMAT = /^[A-Za-z0-9_-]{8,128}$/;

interface CachedResponse {
  status: number;
  body: unknown;
}

/**
 * Scopes the Redis key by caller (authenticated user, falling back to IP), the client's own key,
 * AND `method`+`path`+a hash of the body (B-L4) — so the SAME literal `Idempotency-Key` header
 * reused on a different endpoint, or with a different body, can never replay the wrong response.
 */
function buildRedisKey(req: Request, key: string): string {
  const scope = req.auth?.userId ?? req.ip ?? 'anon';
  const bodyHash = createHash('sha256').update(JSON.stringify(req.body ?? {})).digest('hex');
  return `idem:${scope}:${key}:${req.method}:${req.path}:${bodyHash}`;
}

/**
 * Express middleware: replays a cached response for a repeated `Idempotency-Key` (same caller,
 * method, path and body), otherwise claims a short-lived in-flight lock and lets the request
 * through, caching whatever `res.json(...)` sends (2xx–4xx only; 5xx stays retryable).
 * @throws (via `next`) 422 when the header is present but not {@link KEY_FORMAT}; 409 when another
 *   request with the identical key/method/path/body is still being processed.
 */
export const idempotency: RequestHandler = (req, res, next) => {
  const key = req.header(HEADER);
  if (!key) {
    next();
    return;
  }
  if (!KEY_FORMAT.test(key)) {
    next(validationFailed([{ field: 'Idempotency-Key', message: 'Must be 8-128 characters of letters, numbers, "_" or "-".' }]));
    return;
  }

  const redisKey = buildRedisKey(req, key);
  const inFlightKey = `${redisKey}:lock`;

  redis
    .get(redisKey)
    .then(async (cached) => {
      if (cached !== null) {
        const replay = JSON.parse(cached) as CachedResponse;
        res.status(replay.status).json(replay.body);
        return;
      }
      // B-L4: only one concurrent request per key/method/path/body may proceed; a racing duplicate
      // gets 409 instead of running the handler (and writing) a second time.
      const acquired = await redis.set(inFlightKey, '1', 'PX', IN_FLIGHT_TTL_MS, 'NX');
      if (acquired !== 'OK') {
        next(conflict('A request with this Idempotency-Key is already in progress.'));
        return;
      }
      attachCacheOnResponse(res, redisKey, inFlightKey);
      next();
    })
    .catch((err: unknown) => {
      logger.warn({ err, redisKey }, '[idempotency] read failed, processing without idempotency');
      attachCacheOnResponse(res, redisKey, inFlightKey);
      next();
    });
};

/** Wraps `res.json` so the first response for `redisKey` is cached, and the in-flight lock released, once it is sent. */
function attachCacheOnResponse(res: Response, redisKey: string, inFlightKey: string): void {
  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    redis.del(inFlightKey).catch((err: unknown) => logger.warn({ err, inFlightKey }, '[idempotency] lock release failed'));
    if (res.statusCode < 500) {
      const payload: CachedResponse = { status: res.statusCode, body };
      redis
        .set(redisKey, JSON.stringify(payload), 'EX', CACHE_TTL_SECONDS)
        .catch((err: unknown) => logger.warn({ err, redisKey }, '[idempotency] write failed'));
    }
    return originalJson(body);
  }) as Response['json'];
}
