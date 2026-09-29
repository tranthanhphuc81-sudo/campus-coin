/**
 * ai.quota.ts
 * Enforces the per-user daily LLM-provider-call quota (`AI_DAILY_QUOTA`, D3: counted per
 * PROVIDER CALL, not per item — a 50-item batch is 1 call). Keyed by the UTC calendar day (L5
 * review fix — was the user's LOCAL calendar day, which let a user refill/double-spend the quota
 * early by changing their profile timezone across a UTC-day boundary; UTC is simpler and closes
 * that bypass, at the acceptable cost of the quota not resetting at exactly local midnight). A
 * Redis error fails CLOSED (skips the LLM call, never blocks the underlying save) — see
 * docs/spec/10 §10.5 graceful degradation.
 * Main exports: tryConsumeLlmQuota, getLlmQuotaUsed
 * Spec: docs/spec/05b §5.6 (AI categorization, tier 3 quota) · Rules: D3
 */
import { config } from '../../config/env.js';
import { aiQuotaKey } from '../../lib/cacheKeys.js';
import { logger } from '../../lib/logger.js';
import { redis } from '../../lib/redis.js';

/** 48h TTL — comfortably outlives any single UTC day, no cleanup job needed (D3). */
const QUOTA_KEY_TTL_SEC = 172_800;

/** Today's UTC calendar date as `YYYY-MM-DD`. @param now - Injectable clock for tests. */
function todayUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Atomically increments today's (UTC) LLM-call counter for `userId` and reports whether it is
 * still within {@link config.ai.dailyQuota}. Fails closed (returns `false`) on any Redis error.
 * @param userId - Caller.
 * @param cost - Number of provider calls this attempt represents (default 1).
 * @returns `true` when the call is allowed to proceed.
 */
export async function tryConsumeLlmQuota(userId: string, cost = 1): Promise<boolean> {
  const key = aiQuotaKey(userId, todayUtc());
  try {
    const results = await redis.multi().incrby(key, cost).expire(key, QUOTA_KEY_TTL_SEC, 'NX').exec();
    const count = results?.[0]?.[1] as number | undefined;
    if (count === undefined) return false;
    return count <= config.ai.dailyQuota;
  } catch (err) {
    logger.warn({ err, userId }, '[ai] quota check failed, skipping LLM call (fail closed)');
    return false;
  }
}

/** Reads today's (UTC) used quota for `userId` without consuming any (test/diagnostics helper). */
export async function getLlmQuotaUsed(userId: string): Promise<number> {
  try {
    const raw = await redis.get(aiQuotaKey(userId, todayUtc()));
    return raw ? Number(raw) : 0;
  } catch (err) {
    logger.warn({ err, userId }, '[ai] quota read failed');
    return 0;
  }
}
