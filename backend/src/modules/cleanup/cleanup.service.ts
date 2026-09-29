/**
 * cleanup.service.ts
 * Orchestrates the daily `cleanup.expired` job (docs/spec/04 §4.5 Table 13, docs/spec/09 §9.14):
 * five ordered steps — expired tokens, stale import previews, soft-deleted transaction trash,
 * accounts past their 30-day deletion grace period, then archiving old audit-log rows. Steps run
 * in this exact order because accounts MUST be purged (and their audit rows anonymised) BEFORE the
 * audit-archive step, so a purged account's audit history is anonymised before it is written to
 * disk. Every step is independently try/caught and logged; if ANY step failed, the whole run
 * throws at the end so BullMQ retries it — every step is idempotent, so a retry is always safe
 * (same pattern as `recurring-materialize.processor.ts`).
 * Main exports: runCleanupExpired, CleanupSummary
 * Spec: docs/spec/09 §9.14 · docs/spec/04 §4.5 (Table 13 – cleanup.expired)
 */
import { createGzip } from 'node:zlib';
import { mkdir, rename } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import {
  ACCOUNT_DELETION_GRACE_DAYS,
  AUDIT_ARCHIVE_BATCH_SIZE,
  AUDIT_LOG_RETENTION_MONTHS,
  CLEANUP_BATCH_SIZE,
  EXPIRED_TOKEN_RETENTION_DAYS,
  IMPORT_PREVIEW_TTL_SEC,
  TRASH_RETENTION_DAYS,
} from '@campuscoin/shared';
import { subMonths } from 'date-fns';
import { config } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import { record } from '../audit/audit.service.js';
import { cleanupRepository } from './cleanup.repository.js';

/** One step's outcome: either its counters, or the error it failed with. */
interface StepResult<T> {
  ok: boolean;
  counts: T;
  error?: unknown;
}

/** Aggregate counters returned (and logged) by one {@link runCleanupExpired} run. */
export interface CleanupSummary {
  tokens: { authTokensDeleted: number; refreshFamiliesDeleted: number };
  imports: { markedExpired: number; hardDeleted: number };
  trash: { transactionsDeleted: number };
  accounts: { usersPurged: number };
  auditArchive: { rowsArchived: number; filesWritten: number };
}

/** Options for {@link runCleanupExpired}. */
export interface RunCleanupOptions {
  now?: Date;
  /** Overrides `config.privacy.auditArchiveDir` — tests pass a scratch directory. */
  archiveDir?: string;
}

/** Wraps a step in try/catch, logging its outcome either way; never throws itself. */
async function runStep<T>(step: string, fn: () => Promise<T>): Promise<StepResult<T>> {
  try {
    const counts = await fn();
    logger.info({ step, counts }, '[cleanup] step complete');
    return { ok: true, counts };
  } catch (error) {
    logger.error({ step, err: error }, '[cleanup] step failed');
    return { ok: false, counts: undefined as T, error };
  }
}

// ---- Step 1: expired tokens ------------------------------------------------------------------

async function cleanupExpiredTokens(now: Date): Promise<CleanupSummary['tokens']> {
  const cutoff = new Date(now.getTime() - EXPIRED_TOKEN_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const { count: authTokensDeleted } = await cleanupRepository.deleteExpiredAuthTokens(cutoff);

  const familyIds = await cleanupRepository.findFullyExpiredRefreshFamilies(cutoff, CLEANUP_BATCH_SIZE);
  const { count: refreshFamiliesDeleted } = await cleanupRepository.deleteRefreshFamilies(familyIds);

  return { authTokensDeleted, refreshFamiliesDeleted };
}

// ---- Step 2: import previews ------------------------------------------------------------------

/** Best-effort Redis cleanup for one import batch's preview/raw keys — never fails the step. */
async function deleteImportRedisKeys(batchIds: string[]): Promise<void> {
  if (batchIds.length === 0) return;
  try {
    const keys = batchIds.flatMap((id) => [`import:${id}`, `import:${id}:raw`, `import:${id}:lock`]);
    await redis.del(...keys);
  } catch (err) {
    logger.warn({ err }, '[cleanup] failed to delete import preview Redis keys (best-effort)');
  }
}

async function cleanupImportPreviews(now: Date): Promise<CleanupSummary['imports']> {
  const previewCutoff = new Date(now.getTime() - IMPORT_PREVIEW_TTL_SEC * 1000);
  const staleIds = await cleanupRepository.findStaleInProgressImportBatches(previewCutoff, CLEANUP_BATCH_SIZE);
  const { count: markedExpired } = await cleanupRepository.markImportBatchesExpired(staleIds);
  await deleteImportRedisKeys(staleIds);

  // Closes the P11 known issue: abandoned expired/failed batches older than 30 days are hard-deleted.
  const oldFinishedCutoff = new Date(now.getTime() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const oldFinishedIds = await cleanupRepository.findOldFinishedImportBatches(oldFinishedCutoff, CLEANUP_BATCH_SIZE);
  const { count: hardDeleted } = await cleanupRepository.deleteImportBatches(oldFinishedIds);

  return { markedExpired, hardDeleted };
}

// ---- Step 3: soft-deleted transaction trash -----------------------------------------------

/** Safety cap on how many batches step 3 drains in one run (guards against a runaway loop). */
const TRASH_MAX_BATCHES_PER_RUN = 1000;

async function cleanupTransactionTrash(now: Date): Promise<CleanupSummary['trash']> {
  const cutoff = new Date(now.getTime() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  let total = 0;

  for (let i = 0; i < TRASH_MAX_BATCHES_PER_RUN; i += 1) {
    // Each batch is its own `$transaction`: the `FOR UPDATE` lock is held only for this batch's
    // duration, never for the whole run.
    const batchCount = await prisma.$transaction(async (tx) => {
      const ids = await cleanupRepository.lockTrashedTransactionIds(cutoff, CLEANUP_BATCH_SIZE, tx);
      if (ids.length === 0) return 0;
      await cleanupRepository.anonymizeTransactionHistoryDescriptions(ids, tx);
      const { count } = await cleanupRepository.deleteTransactionsByIds(ids, tx);
      return count;
    });
    total += batchCount;
    if (batchCount < CLEANUP_BATCH_SIZE) break;
  }

  if (total > 0) {
    // One aggregate audit row for the whole run (BR: no single user — a system sweep).
    await record({ action: 'transaction.bulk_delete', actorRole: 'system', metadata: { count: total, reason: 'trash_retention' } });
  }

  return { transactionsDeleted: total };
}

// ---- Step 4: accounts past the deletion grace period ------------------------------------------

/** Best-effort Redis cleanup for one purged user's cached keys — never fails the step. */
async function deleteUserRedisKeys(userId: string): Promise<void> {
  try {
    const patterns = [`ai-quota:${userId}:*`, `report:${userId}:*`, `categories:${userId}:*`, `dash:${userId}:*`];
    const keys = (await Promise.all(patterns.map((p) => redis.keys(p)))).flat();
    if (keys.length > 0) await redis.del(...keys);
  } catch (err) {
    logger.warn({ err, userId }, '[cleanup] failed to delete purged user Redis keys (best-effort)');
  }
}

/**
 * Purges one user's entire footprint, in FK-safe order (Restrict-referencing tables first,
 * categories only after those, cascading tables last, the `users` row itself LAST as a
 * "work remaining" marker — a crash mid-user safely resumes on the next run since every step is
 * idempotent and the user row still exists until the very end).
 */
async function purgeOneAccount(userId: string, cutoff: Date): Promise<void> {
  await cleanupRepository.purgeTransactionHistory(userId);
  await cleanupRepository.purgeRecentActivity(userId);
  await cleanupRepository.purgeTransactions(userId);
  await cleanupRepository.purgeBudgets(userId);
  await cleanupRepository.purgeRecurringRules(userId);
  await cleanupRepository.purgeImportBatches(userId);
  await cleanupRepository.purgeAiCategoryRules(userId);
  await cleanupRepository.purgeCategories(userId); // after every Restrict-referencing table above.
  await cleanupRepository.purgeInsights(userId);
  await cleanupRepository.purgeUserTips(userId);
  await cleanupRepository.purgeNotifications(userId);
  await cleanupRepository.purgeBookmarks(userId);
  await cleanupRepository.purgeAuthTokens(userId);
  await cleanupRepository.purgeRefreshTokens(userId);
  await cleanupRepository.anonymizeAuditLogsForUser(userId);
  // Conditional on `deletedAt <= cutoff`: an admin `enable()` racing in between (clears `deletedAt`)
  // is never overridden by this stale in-flight purge.
  await cleanupRepository.deleteUserIfStillPastGrace(userId, cutoff);
  await deleteUserRedisKeys(userId);
}

async function cleanupPurgedAccounts(now: Date): Promise<CleanupSummary['accounts']> {
  const cutoff = new Date(now.getTime() - ACCOUNT_DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000);
  const userIds = await cleanupRepository.findAccountsPastGrace(cutoff, CLEANUP_BATCH_SIZE);

  let purged = 0;
  for (const userId of userIds) {
    // A crashed run resumes cleanly on the next run (every sub-step is idempotent); one user's
    // unexpected failure must not abort the rest of the batch.
    try {
      await purgeOneAccount(userId, cutoff);
      purged += 1;
    } catch (err) {
      logger.error({ err, userId }, '[cleanup] failed to purge one account; will retry on the next run');
    }
  }

  if (purged > 0) {
    await record({ action: 'transaction.bulk_delete', actorRole: 'system', metadata: { count: purged, reason: 'account_purge' } });
    await record({ action: 'user.delete.completed', actorRole: 'system', metadata: { count: purged } });
  }

  return { usersPurged: purged };
}

// ---- Step 5: audit-log archive ----------------------------------------------------------------

/** Safety cap on how many pages step 5 archives in one run. */
const AUDIT_ARCHIVE_MAX_PAGES_PER_RUN = 500;

/**
 * Writes one page of audit rows as gzip-compressed JSONL to `<archiveDir>/audit-<firstId>-<lastId>.jsonl.gz`,
 * via a `.tmp` suffix + atomic rename so a crash mid-write never leaves a half-written file at the
 * final name (a retry safely overwrites the `.tmp` file and starts again).
 * NOTE (accepted limitation, documented in PROGRESS.md Known Issues): rows already archived to disk
 * before a user's later account purge still contain that user's un-anonymised `actorId`/`ipHash`
 * inside the already-written `.jsonl.gz` file — only rows still in the DB get anonymised.
 */
async function writeAuditArchiveFile(archiveDir: string, rows: { id: bigint }[], jsonlOf: (row: unknown) => string): Promise<string> {
  const firstId = rows[0]!.id;
  const lastId = rows[rows.length - 1]!.id;
  const finalPath = path.join(archiveDir, `audit-${firstId}-${lastId}.jsonl.gz`);
  const tmpPath = `${finalPath}.tmp`;

  const jsonl = rows.map((r) => jsonlOf(r)).join('\n') + '\n';
  // Security fix (Low): these files contain `ipHash`, user agents and third-party email addresses
  // (`metadata.toEmail`) — owner-only permissions on the Linux prod containers (Windows dev mostly
  // ignores the mode bits, but this is still correct/required there per CLAUDE.md's cross-platform
  // rule, so it must not be skipped just because dev is on Windows).
  await pipeline(Readable.from([jsonl]), createGzip(), createWriteStream(tmpPath, { mode: 0o600 }));
  await rename(tmpPath, finalPath);
  return finalPath;
}

async function archiveOldAuditLogs(now: Date, archiveDir: string): Promise<CleanupSummary['auditArchive']> {
  const cutoff = subMonths(now, AUDIT_LOG_RETENTION_MONTHS);
  // Security fix (Low): owner-only directory permissions — the archive holds sensitive PII (see
  // `writeAuditArchiveFile`'s own comment). `recursive: true` on an ALREADY-existing dir is a no-op
  // and never touches its existing mode (Node's documented behaviour), so this is safe to call on
  // every run.
  await mkdir(archiveDir, { recursive: true, mode: 0o700 });

  let rowsArchived = 0;
  let filesWritten = 0;

  for (let i = 0; i < AUDIT_ARCHIVE_MAX_PAGES_PER_RUN; i += 1) {
    const page = await cleanupRepository.findOldAuditLogsPage(cutoff, AUDIT_ARCHIVE_BATCH_SIZE);
    if (page.length === 0) break;

    await writeAuditArchiveFile(archiveDir, page, (row) => JSON.stringify(row, (_key, value) => (typeof value === 'bigint' ? value.toString() : value)));
    filesWritten += 1;

    const firstId = page[0]!.id;
    const lastId = page[page.length - 1]!.id;
    const { count } = await cleanupRepository.deleteArchivedAuditLogRange(firstId, lastId, cutoff);
    rowsArchived += count;

    if (page.length < AUDIT_ARCHIVE_BATCH_SIZE) break;
  }

  return { rowsArchived, filesWritten };
}

/**
 * Runs the full `cleanup.expired` sweep, in order: tokens -> imports -> trash -> accounts ->
 * audit-archive. Every step is independently logged; if any step failed, this throws AFTER running
 * every other step, so BullMQ retries the whole run (safe: every step is idempotent).
 * @param options - `now` (injectable clock for tests) and `archiveDir` (scratch dir for tests).
 * @throws Error listing which step(s) failed, when at least one did.
 */
export async function runCleanupExpired(options: RunCleanupOptions = {}): Promise<CleanupSummary> {
  const now = options.now ?? new Date();
  const archiveDir = options.archiveDir ?? config.privacy.auditArchiveDir;

  const tokens = await runStep('tokens', () => cleanupExpiredTokens(now));
  const imports = await runStep('imports', () => cleanupImportPreviews(now));
  const trash = await runStep('trash', () => cleanupTransactionTrash(now));
  // Accounts MUST run before audit-archive: a purged account's audit rows must be anonymised
  // before they are archived to disk.
  const accounts = await runStep('accounts', () => cleanupPurgedAccounts(now));
  const auditArchive = await runStep('auditArchive', () => archiveOldAuditLogs(now, archiveDir));

  const steps = { tokens, imports, trash, accounts, auditArchive };
  const failed = Object.entries(steps).filter(([, s]) => !s.ok);

  const summary: CleanupSummary = {
    tokens: tokens.counts ?? { authTokensDeleted: 0, refreshFamiliesDeleted: 0 },
    imports: imports.counts ?? { markedExpired: 0, hardDeleted: 0 },
    trash: trash.counts ?? { transactionsDeleted: 0 },
    accounts: accounts.counts ?? { usersPurged: 0 },
    auditArchive: auditArchive.counts ?? { rowsArchived: 0, filesWritten: 0 },
  };

  logger.info(summary, '[cleanup] run complete');
  if (failed.length > 0) {
    throw new Error(`[cleanup] step(s) failed: ${failed.map(([name]) => name).join(', ')}`);
  }
  return summary;
}
