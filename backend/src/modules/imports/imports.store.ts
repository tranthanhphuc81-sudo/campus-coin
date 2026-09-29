/**
 * imports.store.ts
 * Redis-backed storage for a CSV import batch's raw text and parsed preview (docs/spec/05a §5.5:
 * the preview lives in Redis for 24h, never in MySQL). Unlike `lib/cache.ts`'s helpers, these
 * calls do NOT swallow Redis errors — a write failure here means the batch has nothing to parse
 * or show, so the caller (`imports.service.ts`) must see the error and fail the request (503)
 * rather than silently proceeding with no data.
 * Main exports: saveRaw, loadRaw, savePreview, loadPreview, deletePreviewKeys, withPreviewLock
 * Spec: docs/spec/05a §5.5 · docs/spec/09 §9.10
 */
import { randomUUID } from 'node:crypto';
import { importLockKey, importPreviewKey, importRawKey } from '../../lib/cacheKeys.js';
import { logger } from '../../lib/logger.js';
import { conflict } from '../../lib/problem.js';
import { redis } from '../../lib/redis.js';
import type { StoredPreview } from './imports.types.js';

/**
 * How long `withPreviewLock` holds its lock before it would auto-expire (safety net against a
 * crashed holder). B-L5: `updateRows` now batches its category lookups (`findUsableMany`) so the
 * whole locked operation comfortably finishes well under this; the margin is kept generous anyway.
 */
const LOCK_TTL_MS = 10_000;

/**
 * Compare-and-delete Lua script (B-L5): only deletes the lock key when its current value still
 * matches the token the caller acquired it with. Without this, an unconditional `DEL` could
 * release a lock the ORIGINAL holder's TTL already expired on and a SECOND request has since
 * re-acquired — the first (now-late) caller's `DEL` would then steal/corrupt the second caller's
 * still-active lock.
 */
const RELEASE_LOCK_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

/** Stores the decoded CSV text for `import.parse` to read. `expiresAtEpochSec` is an absolute Unix time (`SET ... EXAT`). */
export async function saveRaw(batchId: string, text: string, expiresAtEpochSec: number): Promise<void> {
  await redis.set(importRawKey(batchId), text, 'EXAT', expiresAtEpochSec);
}

/** Reads back the decoded CSV text saved by {@link saveRaw}, or `null` once it has expired/was never saved. */
export async function loadRaw(batchId: string): Promise<string | null> {
  return redis.get(importRawKey(batchId));
}

/**
 * Stores the parsed preview. `expiresAtEpochSec` MUST be pinned to the batch's own
 * `createdAt + IMPORT_PREVIEW_TTL_SEC` (via `SET ... EXAT`) — a re-parse triggered by
 * `PATCH /imports/:id/rows` must never extend how long the preview survives past that original
 * 24h window.
 */
export async function savePreview(batchId: string, preview: StoredPreview, expiresAtEpochSec: number): Promise<void> {
  await redis.set(importPreviewKey(batchId), JSON.stringify(preview), 'EXAT', expiresAtEpochSec);
}

/** Reads back the preview saved by {@link savePreview}, or `null` once it has expired/was never saved. */
export async function loadPreview(batchId: string): Promise<StoredPreview | null> {
  const raw = await redis.get(importPreviewKey(batchId));
  return raw === null ? null : (JSON.parse(raw) as StoredPreview);
}

/** Deletes both the raw text and preview keys (batch discarded, or successfully committed). */
export async function deletePreviewKeys(batchId: string): Promise<void> {
  await redis.del(importRawKey(batchId), importPreviewKey(batchId));
}

/**
 * Runs `fn` while holding a short-lived `SET NX PX` lock on `batchId`'s preview, so two concurrent
 * `PATCH /imports/:id/rows` calls can never race on a read-modify-write of the same preview.
 * @throws {AppError} 409 conflict when the lock is already held by another in-flight request.
 */
export async function withPreviewLock<T>(batchId: string, fn: () => Promise<T>): Promise<T> {
  const lockKey = importLockKey(batchId);
  const token = randomUUID(); // B-L5: unique per acquisition, so only the current holder can release it.
  const acquired = await redis.set(lockKey, token, 'PX', LOCK_TTL_MS, 'NX');
  if (acquired !== 'OK') {
    throw conflict('This import is being updated by another request. Try again.');
  }
  try {
    return await fn();
  } finally {
    // B-L5: compare-and-delete — never removes a lock some other (later) caller now holds.
    await redis.eval(RELEASE_LOCK_SCRIPT, 1, lockKey, token).catch((err: unknown) => {
      logger.warn({ err, lockKey }, '[imports] preview lock release failed');
    });
  }
}
