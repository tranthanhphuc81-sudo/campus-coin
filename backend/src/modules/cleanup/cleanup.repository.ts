/**
 * cleanup.repository.ts
 * Prisma access for the `cleanup.expired` job's five steps (docs/spec/09 §9.14, §4.5 Table 13):
 * expired tokens, stale import batches, soft-deleted transaction trash, accounts past their 30-day
 * deletion grace period, and old audit-log rows. Every raw SQL statement here operates only on
 * fixed, server-computed values (ids already read back from Prisma, `Prisma.join`-escaped id lists,
 * a `Date` cutoff) — never on unsanitised client input (CLAUDE.md A03 invariant).
 * Main exports: cleanupRepository
 * Spec: docs/spec/09 §9.14 (data lifecycle) · docs/spec/04 §4.5 (Table 13 – cleanup.expired)
 */
import { Prisma } from '../../generated/prisma/client.js';
import { ImportBatchStatus, Role, UserStatus } from '../../generated/prisma/enums.js';
import type { AppPrismaClient } from '../../lib/prisma.js';
import { prisma } from '../../lib/prisma.js';

/** Either the shared client or a transaction handle — every method accepts both. */
type Db = AppPrismaClient | Prisma.TransactionClient;

export const cleanupRepository = {
  // ---- Step 1: expired tokens -----------------------------------------------------------------

  /** Deletes every `AuthToken` (verify_email/reset_password) that expired before `cutoff`. */
  deleteExpiredAuthTokens(cutoff: Date, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.authToken.deleteMany({ where: { expiresAt: { lt: cutoff } } });
  },

  /**
   * Rotation families whose NEWEST (max) `expiresAt` is still before `cutoff` — i.e. the whole
   * family is dead, not just some of its rotated-away rows. Deleting only these (never a per-row
   * `expiresAt < cutoff` filter) is what keeps an active family's early rotations alive for
   * `session.repository.ts`'s `familyStart()` 30-day absolute-cap computation.
   */
  async findFullyExpiredRefreshFamilies(cutoff: Date, take: number, db: Db = prisma): Promise<string[]> {
    const rows = await db.refreshToken.groupBy({
      by: ['familyId'],
      _max: { expiresAt: true },
      having: { expiresAt: { _max: { lt: cutoff } } },
      orderBy: { familyId: 'asc' },
      take,
    });
    return rows.map((r) => r.familyId);
  },

  /** Deletes every row of the given (already fully-expired) families. */
  deleteRefreshFamilies(familyIds: string[], db: Db = prisma): Promise<Prisma.BatchPayload> {
    if (familyIds.length === 0) return Promise.resolve({ count: 0 });
    return db.refreshToken.deleteMany({ where: { familyId: { in: familyIds } } });
  },

  // ---- Step 2: import previews ------------------------------------------------------------------

  /** Ids of stale in-progress batches (`uploaded`/`parsing`/`previewed`) older than `cutoff`. */
  async findStaleInProgressImportBatches(cutoff: Date, take: number, db: Db = prisma): Promise<string[]> {
    const rows = await db.importBatch.findMany({
      where: { status: { in: [ImportBatchStatus.uploaded, ImportBatchStatus.parsing, ImportBatchStatus.previewed] }, createdAt: { lt: cutoff } },
      select: { id: true },
      take,
    });
    return rows.map((r) => r.id);
  },

  /** Marks the given batches `expired` and clears their (now-meaningless) error report. */
  markImportBatchesExpired(ids: string[], db: Db = prisma): Promise<Prisma.BatchPayload> {
    if (ids.length === 0) return Promise.resolve({ count: 0 });
    return db.importBatch.updateMany({ where: { id: { in: ids } }, data: { status: ImportBatchStatus.expired, errorReport: Prisma.DbNull } });
  },

  /** Ids of old finished (`expired`/`failed`) batches, abandoned long enough to hard-delete (closes the P11 known issue). */
  async findOldFinishedImportBatches(cutoff: Date, take: number, db: Db = prisma): Promise<string[]> {
    const rows = await db.importBatch.findMany({
      where: { status: { in: [ImportBatchStatus.expired, ImportBatchStatus.failed] }, createdAt: { lt: cutoff } },
      select: { id: true },
      take,
    });
    return rows.map((r) => r.id);
  },

  /** Hard-deletes the given import batches. Only ever called on ids matching {@link findOldFinishedImportBatches}. */
  deleteImportBatches(ids: string[], db: Db = prisma): Promise<Prisma.BatchPayload> {
    if (ids.length === 0) return Promise.resolve({ count: 0 });
    return db.importBatch.deleteMany({ where: { id: { in: ids } } });
  },

  // ---- Step 3: soft-deleted transaction trash -----------------------------------------------

  /**
   * Locks and returns up to `take` ids of transactions soft-deleted before `cutoff`
   * (`FOR UPDATE`, so a concurrent restore cannot race the purge). MUST be called inside a
   * `$transaction` (`tx`) — the lock is released when that transaction commits/rolls back.
   */
  async lockTrashedTransactionIds(cutoff: Date, take: number, tx: Prisma.TransactionClient): Promise<string[]> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM transactions WHERE deleted_at IS NOT NULL AND deleted_at < ${cutoff} ORDER BY id LIMIT ${take} FOR UPDATE
    `;
    return rows.map((r) => r.id);
  },

  /**
   * Nulls out `description` inside `transaction_history.snapshot` (always present) and, only when
   * that history row's `changed_fields` also has a `description` key, nulls it there too — for
   * every history row belonging to `ids`.
   */
  async anonymizeTransactionHistoryDescriptions(ids: string[], tx: Prisma.TransactionClient): Promise<void> {
    if (ids.length === 0) return;
    const idList = Prisma.join(ids);
    await tx.$executeRaw`
      UPDATE transaction_history
      SET
        snapshot = JSON_SET(snapshot, '$.description', NULL),
        changed_fields = CASE
          WHEN changed_fields IS NOT NULL AND JSON_CONTAINS_PATH(changed_fields, 'one', '$.description')
            THEN JSON_SET(changed_fields, '$.description', NULL)
          ELSE changed_fields
        END
      WHERE transaction_id IN (${idList})
    `;
  },

  /** Hard-deletes the given (already-locked, already-history-anonymised) transactions. */
  deleteTransactionsByIds(ids: string[], tx: Prisma.TransactionClient): Promise<Prisma.BatchPayload> {
    if (ids.length === 0) return Promise.resolve({ count: 0 });
    return tx.transaction.deleteMany({ where: { id: { in: ids } } });
  },

  // ---- Step 4: accounts past the deletion grace period ----------------------------------------

  /** Ids of student accounts disabled AND past their `deletedAt` grace-period cutoff. */
  async findAccountsPastGrace(cutoff: Date, take: number, db: Db = prisma): Promise<string[]> {
    const rows = await db.user.findMany({
      where: { role: Role.student, status: UserStatus.disabled, deletedAt: { lte: cutoff } },
      select: { id: true },
      take,
    });
    return rows.map((r) => r.id);
  },

  /** Deletes every history row for `userId` (no FK on this table — deleted explicitly for real erasure). */
  purgeTransactionHistory(userId: string, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.transactionHistory.deleteMany({ where: { userId } });
  },
  /** Deletes every "recent activity" entry for `userId`. */
  purgeRecentActivity(userId: string, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.recentActivity.deleteMany({ where: { userId } });
  },
  /** Deletes every (any, incl. soft-deleted) transaction for `userId`. */
  purgeTransactions(userId: string, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.transaction.deleteMany({ where: { userId } });
  },
  /** Deletes every budget for `userId`. */
  purgeBudgets(userId: string, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.budget.deleteMany({ where: { userId } });
  },
  /** Deletes every recurring rule for `userId`. */
  purgeRecurringRules(userId: string, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.recurringRule.deleteMany({ where: { userId } });
  },
  /** Deletes every import batch for `userId`. */
  purgeImportBatches(userId: string, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.importBatch.deleteMany({ where: { userId } });
  },
  /** Deletes every learned AI merchant->category rule for `userId`. */
  purgeAiCategoryRules(userId: string, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.aiCategoryRule.deleteMany({ where: { userId } });
  },
  /** Deletes every personal category for `userId` (must run AFTER every Restrict-referencing table above). */
  purgeCategories(userId: string, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.category.deleteMany({ where: { userId } });
  },
  /** Deletes every insight for `userId`. */
  purgeInsights(userId: string, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.insight.deleteMany({ where: { userId } });
  },
  /** Deletes every generated tip for `userId`. */
  purgeUserTips(userId: string, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.userTip.deleteMany({ where: { userId } });
  },
  /** Deletes every notification for `userId`. */
  purgeNotifications(userId: string, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.notification.deleteMany({ where: { userId } });
  },
  /** Deletes every bookmark for `userId`. */
  purgeBookmarks(userId: string, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.bookmark.deleteMany({ where: { userId } });
  },
  /** Deletes every verify/reset auth token for `userId`. */
  purgeAuthTokens(userId: string, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.authToken.deleteMany({ where: { userId } });
  },
  /** Deletes every refresh-token session row for `userId`. */
  purgeRefreshTokens(userId: string, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.refreshToken.deleteMany({ where: { userId } });
  },

  /**
   * Anonymises `userId`'s footprint in `audit_logs` (docs/spec/09 §9.14: "audit log liên quan được
   * ẩn danh"). Keeps `action`/`createdAt`/`entityType`/`actorRole` (security stats must survive).
   * Also scrubs `job.failed` rows whose jobId-derived `entity_id`/`metadata.jobId` merely CONTAINS
   * this userId (several BullMQ jobIds embed it directly, e.g. `insight-<userId>-<month>`).
   * Idempotent: re-running on an already-anonymised row is a no-op (every `WHERE` still matches
   * the same rows, and re-applying `JSON_SET`/`JSON_REMOVE` produces the identical result).
   */
  async anonymizeAuditLogsForUser(userId: string, db: Db = prisma): Promise<void> {
    // Rows this user acted in: strip the actor id + request fingerprints, scrub a few metadata keys
    // that can carry PII (another user's email/family id), flag `anonymized: true`.
    await db.$executeRaw`
      UPDATE audit_logs
      SET
        actor_id = NULL,
        ip_hash = NULL,
        user_agent = NULL,
        metadata = JSON_SET(
          JSON_REMOVE(COALESCE(metadata, JSON_OBJECT()), '$.toEmail', '$.familyId', '$.targetUserId'),
          '$.anonymized', TRUE
        )
      WHERE actor_id = ${userId}
    `;
    // Rows where an ADMIN acted ON this user (entity_type='user'): the admin actor stays intact —
    // only the target user id is scrubbed.
    await db.$executeRaw`
      UPDATE audit_logs
      SET
        entity_id = NULL,
        metadata = JSON_SET(COALESCE(metadata, JSON_OBJECT()), '$.anonymized', TRUE)
      WHERE entity_type = 'user' AND entity_id = ${userId}
    `;
    // The admin-attributed "send reset link" case (P15 security fix): the row's actor is the ADMIN,
    // but `metadata.targetUserId` names this user — strip just that one key.
    await db.$executeRaw`
      UPDATE audit_logs
      SET metadata = JSON_REMOVE(metadata, '$.targetUserId')
      WHERE action = 'auth.password.reset_requested'
        AND metadata IS NOT NULL
        AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.targetUserId')) = ${userId}
    `;
    // Security fix (Low): `job.failed` rows (`jobs/jobFailed.ts`) store the BullMQ jobId in both
    // `entity_id` and `metadata.jobId`, and several jobIds embed this userId directly
    // (`insight-<userId>-<month>`, `account-delete-<userId>-<ts>`, `lockout:<userId>:<ts>`,
    // `password-changed:<userId>:<ts>`) — none of those match the exact-equality branches above, so
    // this user's id would otherwise survive inside those rows. Matches by SUBSTRING via a
    // parameterized `LIKE CONCAT('%', ?, '%')` (never string-concatenated into the SQL itself).
    // Idempotent: once `entity_id` is NULL and `metadata.jobId` removed, the WHERE no longer matches.
    await db.$executeRaw`
      UPDATE audit_logs
      SET
        entity_id = NULL,
        metadata = JSON_SET(JSON_REMOVE(COALESCE(metadata, JSON_OBJECT()), '$.jobId'), '$.anonymized', TRUE)
      WHERE action = 'job.failed'
        AND (
          (entity_id IS NOT NULL AND entity_id LIKE CONCAT('%', ${userId}, '%'))
          OR (metadata IS NOT NULL AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.jobId')) LIKE CONCAT('%', ${userId}, '%'))
        )
    `;
  },

  /** Conditional on `deletedAt <= cutoff`: an admin `enable()` in between (clears `deletedAt`) is never overridden by a stale purge. */
  deleteUserIfStillPastGrace(userId: string, cutoff: Date, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.user.deleteMany({ where: { id: userId, deletedAt: { lte: cutoff } } });
  },

  // ---- Step 5: audit-log archive ----------------------------------------------------------------

  /** One page of the oldest audit rows older than `cutoff`, for archiving. */
  findOldAuditLogsPage(cutoff: Date, take: number, db: Db = prisma) {
    return db.auditLog.findMany({ where: { createdAt: { lt: cutoff } }, orderBy: { id: 'asc' }, take });
  },

  /** Deletes the archived `[firstId, lastId]` range, re-checking `createdAt < cutoff` (never deletes a row not actually archived). */
  deleteArchivedAuditLogRange(firstId: bigint, lastId: bigint, cutoff: Date, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.auditLog.deleteMany({ where: { id: { gte: firstId, lte: lastId }, createdAt: { lt: cutoff } } });
  },
};
