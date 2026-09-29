/**
 * imports-store.test.ts
 * Integration tests for `imports.store.ts`'s `withPreviewLock` against a real Redis (skipped when
 * REDIS_URL is not set). Covers B-L5: a stale/late release can never delete a lock some other
 * (later) caller now holds under a different token, and two overlapping lock attempts still
 * contend correctly (409 while the first holds it).
 * Spec: docs/spec/05a §5.5 · docs/spec/09 §9.10
 */
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { importLockKey } from '../../../src/lib/cacheKeys.js';
import { redis } from '../../../src/lib/redis.js';
import { withPreviewLock } from '../../../src/modules/imports/imports.store.js';

describe.skipIf(!process.env.REDIS_URL)('withPreviewLock', () => {
  afterAll(async () => {
    await redis.quit();
  });

  it('B-L5: a compare-and-delete release never removes a lock a later caller now holds under a different token', async () => {
    const batchId = `test-${randomUUID()}`;
    const lockKey = importLockKey(batchId);
    let sawOwnTokenWhileRunning = false;

    await withPreviewLock(batchId, async () => {
      sawOwnTokenWhileRunning = (await redis.get(lockKey)) !== null;
      // Simulate this caller's lock having expired mid-operation and a second request re-acquiring
      // it under a brand-new token — the ORIGINAL caller's release (below, in `finally`) must not
      // touch this new value.
      await redis.set(lockKey, 'stolen-by-another-request', 'PX', 60_000);
    });

    expect(sawOwnTokenWhileRunning).toBe(true);
    expect(await redis.get(lockKey)).toBe('stolen-by-another-request'); // survives the first caller's release.
    await redis.del(lockKey);
  });

  it('two overlapping lock attempts: the second is rejected (409) while the first still holds the lock', async () => {
    const batchId = `test-${randomUUID()}`;
    let releaseFirst: (() => void) | undefined;
    let resolveFirstStarted: (() => void) | undefined;
    const firstMayFinish = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const firstStarted = new Promise<void>((resolve) => {
      resolveFirstStarted = resolve;
    });

    const first = withPreviewLock(batchId, async () => {
      resolveFirstStarted!();
      await firstMayFinish;
      return 'first';
    });
    await firstStarted; // deterministic: the first call has claimed the lock before the second attempts it.

    await expect(withPreviewLock(batchId, async () => 'second')).rejects.toMatchObject({ status: 409 });

    releaseFirst!();
    await expect(first).resolves.toBe('first');
  });
});
