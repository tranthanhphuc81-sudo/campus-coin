/**
 * redis.ts
 * ioredis client singleton shared by cache, rate limiting, idempotency, BullMQ and SSE pub/sub.
 * Reconnects automatically; a connection error is logged, never thrown, so a Redis outage
 * degrades the app instead of crashing it (docs/spec/10 §10.5 graceful degradation).
 * Main exports: redis, getRedis, createRedisClient
 * Spec: docs/spec/04 §4.1 (Redis responsibilities) · docs/spec/10 §10.5
 */
import { Redis, type RedisOptions } from 'ioredis';
import { config } from '../config/env.js';
import { logger } from './logger.js';

const MAX_RETRY_DELAY_MS = 5000;

/**
 * Creates a new ioredis client. Prefer the shared {@link redis} singleton; use this only for a
 * dedicated connection (e.g. BullMQ, which needs its own connection per Queue/Worker).
 * @param options - Overrides merged over the defaults (e.g. `{ maxRetriesPerRequest: null }` for BullMQ).
 */
export function createRedisClient(options: Partial<RedisOptions> = {}): Redis {
  const client = new Redis(config.redis.url, {
    retryStrategy: (attempt: number) => Math.min(attempt * 200, MAX_RETRY_DELAY_MS),
    lazyConnect: false,
    ...options,
  });
  // ioredis crashes the process if an 'error' event has no listener — always attach one.
  client.on('error', (err) => {
    logger.warn({ err }, '[redis] connection error');
  });
  return client;
}

// Cache on globalThis so `tsx watch` reloads do not open a new connection on every restart.
const globalForRedis = globalThis as unknown as { __campuscoinRedis?: Redis };

/** Returns the process-wide Redis client, creating it on first use. */
export function getRedis(): Redis {
  globalForRedis.__campuscoinRedis ??= createRedisClient();
  return globalForRedis.__campuscoinRedis;
}

/** Shared Redis client. Lazy proxy over {@link getRedis} so importing this module never connects. */
export const redis: Redis = new Proxy({} as Redis, {
  get(_target, prop) {
    const client = getRedis();
    const value: unknown = Reflect.get(client, prop, client);
    return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(client) : value;
  },
});
