/**
 * cache.ts
 * Thin JSON cache over Redis (docs/spec/10 §10.3 cache strategy: dashboard summary, reports,
 * categories, AI results, announcements). Every operation swallows Redis errors and logs a
 * warning instead of throwing, so a Redis outage falls back to reading the database directly
 * (docs/spec/10 §10.5 graceful degradation) instead of breaking the request.
 * Main exports: cacheGet, cacheSet, cacheDel, cacheDelByPattern, markOnceOrProceed
 * Spec: docs/spec/10 §10.3 (cache strategy) · §10.5 (graceful degradation)
 */
import { logger } from './logger.js';
import { redis } from './redis.js';

/**
 * Reads and JSON-parses a cached value.
 * @returns The parsed value, or `undefined` on a cache miss or Redis error.
 */
export async function cacheGet<T>(key: string): Promise<T | undefined> {
  try {
    const raw = await redis.get(key);
    return raw === null ? undefined : (JSON.parse(raw) as T);
  } catch (err) {
    logger.warn({ err, key }, '[cache] get failed, skipping cache');
    return undefined;
  }
}

/**
 * JSON-serialises and stores a value with a TTL.
 * @param ttlSeconds - Expiry in seconds (see docs/spec/10 Table 61 for the value per data kind).
 */
export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch (err) {
    logger.warn({ err, key }, '[cache] set failed, skipping cache');
  }
}

/** Deletes a single cache key. Never throws. */
export async function cacheDel(key: string): Promise<void> {
  try {
    await redis.del(key);
  } catch (err) {
    logger.warn({ err, key }, '[cache] del failed');
  }
}

/**
 * Deletes every key matching a glob pattern (e.g. `dash:{userId}:*`), used for cache invalidation
 * after a domain event. Uses SCAN (not KEYS) so it never blocks Redis on a large keyspace.
 */
export async function cacheDelByPattern(pattern: string): Promise<void> {
  try {
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = next;
      if (keys.length > 0) await redis.del(...keys);
    } while (cursor !== '0');
  } catch (err) {
    logger.warn({ err, pattern }, '[cache] delByPattern failed');
  }
}

/**
 * `SET key 1 EX ttlSeconds NX` idempotency guard (P10 AI-learning dedupe: a domain-event handler
 * and a direct `/ai/feedback` call must not double-count the same transaction version). Fails
 * OPEN on a Redis error — returns `true` (safe to proceed) rather than silently dropping a
 * legitimate learning update just because Redis is unreachable; a rare double-count from that
 * edge case is far cheaper than never learning at all.
 * @returns `true` when the key was newly set (or Redis errored) — caller should proceed;
 *   `false` when the key already existed — caller should skip (already handled).
 */
export async function markOnceOrProceed(key: string, ttlSeconds: number): Promise<boolean> {
  try {
    const result = await redis.set(key, '1', 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  } catch (err) {
    logger.warn({ err, key }, '[cache] markOnceOrProceed failed, proceeding without the idempotency guard');
    return true;
  }
}
