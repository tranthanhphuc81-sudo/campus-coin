/**
 * cleanup-expired.test.ts
 * Integration tests for the `cleanup.expired` job (`modules/cleanup/cleanup.service.ts`) against
 * real MySQL + Redis (skipped without DATABASE_URL). Every fixture sets its own timestamp directly
 * at insert time (no fake timers — documented as flaky with ioredis/Prisma in this codebase) and
 * `runCleanupExpired` is called directly with an explicit `now`/`archiveDir`. Every assertion is
 * scoped to rows/ids created by the test itself (never a global table count — the DB is shared by
 * the parallel test run).
 * Spec: docs/spec/09 §9.14 (data lifecycle) · docs/spec/04 §4.5 (Table 13 – cleanup.expired)
 */
import { randomUUID } from 'node:crypto';
import { createGunzip } from 'node:zlib';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

const { prisma } = await import('../../../src/lib/prisma.js');
const { runCleanupExpired } = await import('../../../src/modules/cleanup/cleanup.service.js');
const { toDbDate } = await import('../../../src/lib/dates.js');
const { hashPassword } = await import('../../../src/lib/password.js');
const { sha256Hex } = await import('../../../src/lib/tokens.js');

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** A fixed "now" every test anchors its fixture ages to (never `Date.now()` — deterministic tests). */
const NOW = new Date('2026-09-28T12:00:00.000Z');

const createdUserIds: string[] = [];
const createdArchiveDirs: string[] = [];

/** Creates a bare active student, tracked for cleanup. Not routed through the shared `auth.js` fixture (we need full control over every column, e.g. `deletedAt`). */
async function createUser(overrides: Partial<{ status: string; deletedAt: Date | null }> = {}): Promise<string> {
  const passwordHash = await hashPassword('irrelevant-Password1');
  const user = await prisma.user.create({
    data: {
      email: `${randomUUID()}@test.local`,
      passwordHash,
      fullName: 'Cleanup Test User',
      role: 'student',
      status: (overrides.status as never) ?? 'active',
      emailVerifiedAt: new Date(),
      deletedAt: overrides.deletedAt ?? null,
    },
  });
  createdUserIds.push(user.id);
  return user.id;
}

async function defaultExpenseCategory(): Promise<number> {
  const category = await prisma.category.findFirstOrThrow({ where: { isDefault: true, type: 'expense' } });
  return category.id;
}

async function newArchiveDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'cc-audit-archive-'));
  createdArchiveDirs.push(dir);
  return dir;
}

describe.skipIf(!process.env.DATABASE_URL)('cleanup.expired job', () => {
  afterEach(async () => {
    if (createdUserIds.length > 0) {
      const where = { userId: { in: createdUserIds } };
      await prisma.transactionHistory.deleteMany({ where });
      await prisma.recentActivity.deleteMany({ where });
      await prisma.userTip.deleteMany({ where });
      await prisma.insight.deleteMany({ where });
      await prisma.notification.deleteMany({ where });
      await prisma.bookmark.deleteMany({ where });
      await prisma.aiCategoryRule.deleteMany({ where });
      await prisma.transaction.deleteMany({ where });
      await prisma.budget.deleteMany({ where });
      await prisma.recurringRule.deleteMany({ where });
      await prisma.importBatch.deleteMany({ where });
      await prisma.category.deleteMany({ where });
      await prisma.authToken.deleteMany({ where });
      await prisma.refreshToken.deleteMany({ where });
      await prisma.auditLog.deleteMany({ where: { actorId: { in: createdUserIds } } });
      await prisma.auditLog.deleteMany({ where: { entityType: 'user', entityId: { in: createdUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      createdUserIds.length = 0;
    }
    for (const dir of createdArchiveDirs.splice(0)) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ---- Step 1: expired tokens -----------------------------------------------------------------

  it('deletes an auth token expired 8 days ago, keeps one expired only 6 days ago', async () => {
    const userId = await createUser();
    const oldToken = await prisma.authToken.create({
      data: { userId, purpose: 'reset_password', tokenHash: sha256Hex(`old-${userId}`), expiresAt: new Date(NOW.getTime() - 8 * DAY_MS) },
    });
    const freshToken = await prisma.authToken.create({
      data: { userId, purpose: 'reset_password', tokenHash: sha256Hex(`fresh-${userId}`), expiresAt: new Date(NOW.getTime() - 6 * DAY_MS) },
    });

    await runCleanupExpired({ now: NOW, archiveDir: await newArchiveDir() });

    const remaining = await prisma.authToken.findMany({ where: { id: { in: [oldToken.id, freshToken.id] } } });
    expect(remaining.map((r) => r.id)).toEqual([freshToken.id]);
  });

  it('deletes a fully-expired refresh family entirely, but keeps an active family\'s old rotated rows (security: must not shrink familyStart)', async () => {
    const userId = await createUser();
    const deadFamily = randomUUID();
    const activeFamily = randomUUID();

    // Dead family: every row expired 8+ days ago.
    const deadRow1 = await prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: sha256Hex(`dead1-${userId}`),
        familyId: deadFamily,
        expiresAt: new Date(NOW.getTime() - 9 * DAY_MS),
        revokedAt: new Date(NOW.getTime() - 9 * DAY_MS),
      },
    });
    const deadRow2 = await prisma.refreshToken.create({
      data: { userId, tokenHash: sha256Hex(`dead2-${userId}`), familyId: deadFamily, expiresAt: new Date(NOW.getTime() - 8 * DAY_MS) },
    });

    // Active family: an OLD rotated-away row (would look "expired" on its own) plus a current unexpired row.
    const activeOldRotated = await prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: sha256Hex(`active-old-${userId}`),
        familyId: activeFamily,
        createdAt: new Date(NOW.getTime() - 40 * DAY_MS),
        expiresAt: new Date(NOW.getTime() - 33 * DAY_MS), // long expired on its own
        revokedAt: new Date(NOW.getTime() - 33 * DAY_MS),
      },
    });
    const activeCurrent = await prisma.refreshToken.create({
      data: { userId, tokenHash: sha256Hex(`active-current-${userId}`), familyId: activeFamily, expiresAt: new Date(NOW.getTime() + 5 * DAY_MS) },
    });

    await runCleanupExpired({ now: NOW, archiveDir: await newArchiveDir() });

    const deadRemaining = await prisma.refreshToken.findMany({ where: { id: { in: [deadRow1.id, deadRow2.id] } } });
    expect(deadRemaining).toHaveLength(0);

    const activeRemaining = await prisma.refreshToken.findMany({ where: { id: { in: [activeOldRotated.id, activeCurrent.id] } } });
    expect(activeRemaining.map((r) => r.id).sort()).toEqual([activeCurrent.id, activeOldRotated.id].sort());
  });

  // ---- Step 2: import previews -----------------------------------------------------------------

  it('marks a 25h-old in-progress batch expired, leaves a 23h-old one untouched', async () => {
    const userId = await createUser();
    const stale = await prisma.importBatch.create({
      data: {
        userId,
        originalFilename: 'stale.csv',
        fileSha256: `stale-${userId}`,
        status: 'uploaded',
        createdAt: new Date(NOW.getTime() - 25 * HOUR_MS),
      },
    });
    const fresh = await prisma.importBatch.create({
      data: {
        userId,
        originalFilename: 'fresh.csv',
        fileSha256: `fresh-${userId}`,
        status: 'uploaded',
        createdAt: new Date(NOW.getTime() - 23 * HOUR_MS),
      },
    });

    await runCleanupExpired({ now: NOW, archiveDir: await newArchiveDir() });

    const staleAfter = await prisma.importBatch.findUniqueOrThrow({ where: { id: stale.id } });
    expect(staleAfter.status).toBe('expired');
    const freshAfter = await prisma.importBatch.findUniqueOrThrow({ where: { id: fresh.id } });
    expect(freshAfter.status).toBe('uploaded');
  });

  it('hard-deletes a 31-day-old expired/failed batch, keeps a 29-day-old one', async () => {
    const userId = await createUser();
    const old = await prisma.importBatch.create({
      data: {
        userId,
        originalFilename: 'old.csv',
        fileSha256: `old-${userId}`,
        status: 'failed',
        createdAt: new Date(NOW.getTime() - 31 * DAY_MS),
      },
    });
    const recent = await prisma.importBatch.create({
      data: {
        userId,
        originalFilename: 'recent.csv',
        fileSha256: `recent-${userId}`,
        status: 'failed',
        createdAt: new Date(NOW.getTime() - 29 * DAY_MS),
      },
    });

    await runCleanupExpired({ now: NOW, archiveDir: await newArchiveDir() });

    const remaining = await prisma.importBatch.findMany({ where: { id: { in: [old.id, recent.id] } } });
    expect(remaining.map((r) => r.id)).toEqual([recent.id]);
  });

  // ---- Step 3: soft-deleted transaction trash -----------------------------------------------

  it('purges a transaction soft-deleted 31 days ago (and nulls its history description), keeps one deleted 29 days ago', async () => {
    const userId = await createUser();
    const categoryId = await defaultExpenseCategory();

    const oldTxn = await prisma.transaction.create({
      data: {
        userId,
        categoryId,
        type: 'expense',
        amount: '5.00',
        currency: 'USD',
        description: 'old deleted',
        txnDate: toDbDate('2026-01-01'),
        deletedAt: new Date(NOW.getTime() - 31 * DAY_MS),
      },
    });
    await prisma.transactionHistory.create({
      data: {
        transactionId: oldTxn.id,
        userId,
        action: 'delete',
        snapshot: { id: oldTxn.id, description: 'old deleted', amount: '5.00' },
        changedFields: { description: 'old deleted' },
        changedBy: userId,
      },
    });

    const recentTxn = await prisma.transaction.create({
      data: {
        userId,
        categoryId,
        type: 'expense',
        amount: '6.00',
        currency: 'USD',
        description: 'recent deleted',
        txnDate: toDbDate('2026-01-01'),
        deletedAt: new Date(NOW.getTime() - 29 * DAY_MS),
      },
    });

    await runCleanupExpired({ now: NOW, archiveDir: await newArchiveDir() });

    const oldAfter = await prisma.transaction.findUnique({ where: { id: oldTxn.id } });
    expect(oldAfter).toBeNull();
    const recentAfter = await prisma.transaction.findUnique({ where: { id: recentTxn.id } });
    expect(recentAfter).not.toBeNull();

    const historyAfter = await prisma.transactionHistory.findMany({ where: { transactionId: oldTxn.id } });
    expect(historyAfter).toHaveLength(1);
    expect((historyAfter[0]!.snapshot as { description: unknown }).description).toBeNull();
    expect((historyAfter[0]!.changedFields as { description: unknown }).description).toBeNull();

    const bulkDeleteAudit = await prisma.auditLog.findFirst({
      where: { action: 'transaction.bulk_delete', metadata: { path: '$.reason', equals: 'trash_retention' } as never },
      orderBy: { id: 'desc' },
    });
    expect(bulkDeleteAudit).not.toBeNull();
  });

  // ---- Step 4: accounts past the deletion grace period ------------------------------------------

  it('purges an account disabled+deleted 31 days ago (every owned row gone, audit anonymised, idempotent on 2nd run), keeps one at 29 days', async () => {
    const purgedUserId = await createUser({ status: 'disabled', deletedAt: new Date(NOW.getTime() - 31 * DAY_MS) });
    const controlUserId = await createUser({ status: 'disabled', deletedAt: new Date(NOW.getTime() - 29 * DAY_MS) });
    const category = await prisma.category.create({
      data: { userId: purgedUserId, ownerKey: purgedUserId, name: `Purge-${Date.now()}`, type: 'expense' },
    });

    const txn = await prisma.transaction.create({
      data: { userId: purgedUserId, categoryId: category.id, type: 'expense', amount: '3.00', currency: 'USD', txnDate: toDbDate('2026-01-01') },
    });
    await prisma.transactionHistory.create({
      data: { transactionId: txn.id, userId: purgedUserId, action: 'create', snapshot: { id: txn.id }, changedBy: purgedUserId },
    });
    await prisma.recentActivity.create({ data: { userId: purgedUserId, transactionId: txn.id, action: 'viewed' } });
    await prisma.budget.create({ data: { userId: purgedUserId, categoryId: category.id, month: toDbDate('2026-01-01'), limitAmount: '50.00' } });
    await prisma.recurringRule.create({
      data: {
        userId: purgedUserId,
        categoryId: category.id,
        type: 'expense',
        amount: '9.99',
        frequency: 'monthly',
        dayOfMonth: 1,
        startDate: toDbDate('2026-01-01'),
        nextRunDate: toDbDate('2026-02-01'),
      },
    });
    await prisma.importBatch.create({
      data: { userId: purgedUserId, originalFilename: 'x.csv', fileSha256: `x-${purgedUserId}`, status: 'committed' },
    });
    await prisma.aiCategoryRule.create({ data: { userId: purgedUserId, merchantKey: 'test merchant', categoryId: category.id } });
    await prisma.insight.create({
      data: { userId: purgedUserId, month: toDbDate('2026-01-01'), generator: 'template', status: 'completed', flaggedPatterns: [], statsSnapshot: {} },
    });
    const template = await prisma.tipTemplate.findFirstOrThrow();
    await prisma.userTip.create({
      data: {
        userId: purgedUserId,
        templateId: template.id,
        period: toDbDate('2026-01-01'),
        renderedTitle: 't',
        renderedBody: 'b',
        impactAmount: '1.00',
        score: '1.0000',
      },
    });
    await prisma.notification.create({ data: { userId: purgedUserId, type: 'system', title: 'hi', dedupeKey: `dk-${purgedUserId}` } });
    await prisma.bookmark.create({ data: { userId: purgedUserId, targetType: 'tip', targetRef: '1' } });
    await prisma.authToken.create({
      data: { userId: purgedUserId, purpose: 'reset_password', tokenHash: sha256Hex(`t-${purgedUserId}`), expiresAt: new Date(NOW.getTime() + DAY_MS) },
    });
    await prisma.refreshToken.create({
      data: { userId: purgedUserId, tokenHash: sha256Hex(`r-${purgedUserId}`), familyId: randomUUID(), expiresAt: new Date(NOW.getTime() + DAY_MS) },
    });

    // Audit rows this user's footprint touches: one as actor, one as an admin's target.
    const selfAudit = await prisma.auditLog.create({
      data: {
        actorId: purgedUserId,
        actorRole: 'student',
        action: 'auth.login.success',
        ipHash: 'a'.repeat(64),
        userAgent: 'UA',
        metadata: { toEmail: 'secret@example.com', keep: 'yes' },
      },
    });
    const adminTargetAudit = await prisma.auditLog.create({
      data: { actorId: randomUUID(), actorRole: 'admin', action: 'admin.user.disable', entityType: 'user', entityId: purgedUserId },
    });

    await runCleanupExpired({ now: NOW, archiveDir: await newArchiveDir() });

    // Every owned row is gone.
    expect(await prisma.transaction.findUnique({ where: { id: txn.id } })).toBeNull();
    expect(await prisma.transactionHistory.findMany({ where: { userId: purgedUserId } })).toHaveLength(0);
    expect(await prisma.recentActivity.findMany({ where: { userId: purgedUserId } })).toHaveLength(0);
    expect(await prisma.budget.findMany({ where: { userId: purgedUserId } })).toHaveLength(0);
    expect(await prisma.recurringRule.findMany({ where: { userId: purgedUserId } })).toHaveLength(0);
    expect(await prisma.importBatch.findMany({ where: { userId: purgedUserId } })).toHaveLength(0);
    expect(await prisma.aiCategoryRule.findMany({ where: { userId: purgedUserId } })).toHaveLength(0);
    expect(await prisma.category.findUnique({ where: { id: category.id } })).toBeNull();
    expect(await prisma.insight.findMany({ where: { userId: purgedUserId } })).toHaveLength(0);
    expect(await prisma.userTip.findMany({ where: { userId: purgedUserId } })).toHaveLength(0);
    expect(await prisma.notification.findMany({ where: { userId: purgedUserId } })).toHaveLength(0);
    expect(await prisma.bookmark.findMany({ where: { userId: purgedUserId } })).toHaveLength(0);
    expect(await prisma.authToken.findMany({ where: { userId: purgedUserId } })).toHaveLength(0);
    expect(await prisma.refreshToken.findMany({ where: { userId: purgedUserId } })).toHaveLength(0);
    expect(await prisma.user.findUnique({ where: { id: purgedUserId } })).toBeNull();

    // The control (only 29 days) user is entirely unaffected.
    const controlAfter = await prisma.user.findUnique({ where: { id: controlUserId } });
    expect(controlAfter).not.toBeNull();
    expect(controlAfter!.deletedAt).not.toBeNull();

    // Audit anonymisation.
    const selfAuditAfter = await prisma.auditLog.findUniqueOrThrow({ where: { id: selfAudit.id } });
    expect(selfAuditAfter.actorId).toBeNull();
    expect(selfAuditAfter.ipHash).toBeNull();
    expect(selfAuditAfter.userAgent).toBeNull();
    expect(selfAuditAfter.action).toBe('auth.login.success'); // action/createdAt/actorRole survive.
    expect(selfAuditAfter.actorRole).toBe('student');
    const selfMeta = selfAuditAfter.metadata as { toEmail?: string; keep?: string; anonymized?: boolean };
    expect(selfMeta.toEmail).toBeUndefined();
    expect(selfMeta.keep).toBe('yes');
    expect(selfMeta.anonymized).toBe(true);

    const adminTargetAfter = await prisma.auditLog.findUniqueOrThrow({ where: { id: adminTargetAudit.id } });
    expect(adminTargetAfter.entityId).toBeNull();
    expect(adminTargetAfter.actorId).not.toBeNull(); // the ADMIN actor is untouched.
    expect((adminTargetAfter.metadata as { anonymized?: boolean } | null)?.anonymized).toBe(true);

    // Idempotent: running again produces byte-identical rows.
    await runCleanupExpired({ now: NOW, archiveDir: await newArchiveDir() });
    const selfAuditSecondRun = await prisma.auditLog.findUniqueOrThrow({ where: { id: selfAudit.id } });
    expect(selfAuditSecondRun).toEqual(selfAuditAfter);
    const adminTargetSecondRun = await prisma.auditLog.findUniqueOrThrow({ where: { id: adminTargetAudit.id } });
    expect(adminTargetSecondRun).toEqual(adminTargetAfter);

    // Clean up the two audit rows this test created directly (not covered by createdUserIds' actorId
    // cleanup since actorId was nulled by anonymisation).
    await prisma.auditLog.deleteMany({ where: { id: { in: [selfAudit.id, adminTargetAudit.id] } } });
  });

  it('an admin-attributed reset-link audit row (targetUserId in metadata) has only that key stripped, action/actorId untouched', async () => {
    const purgedUserId = await createUser({ status: 'disabled', deletedAt: new Date(NOW.getTime() - 31 * DAY_MS) });
    const adminId = randomUUID();
    const row = await prisma.auditLog.create({
      data: {
        actorId: adminId,
        actorRole: 'admin',
        action: 'auth.password.reset_requested',
        metadata: { targetUserId: purgedUserId, other: 'keep-me' },
      },
    });

    await runCleanupExpired({ now: NOW, archiveDir: await newArchiveDir() });

    const after = await prisma.auditLog.findUniqueOrThrow({ where: { id: row.id } });
    expect(after.actorId).toBe(adminId); // the admin actor row is NOT touched by the generic actor-anonymisation branch (different actorId).
    const meta = after.metadata as { targetUserId?: string; other?: string };
    expect(meta.targetUserId).toBeUndefined();
    expect(meta.other).toBe('keep-me');

    await prisma.auditLog.delete({ where: { id: row.id } });
  });

  it('Fix 6: a job.failed row whose entityId/metadata.jobId merely CONTAINS the userId (BullMQ jobIds embed it directly) is anonymised on account purge, idempotently', async () => {
    const purgedUserId = await createUser({ status: 'disabled', deletedAt: new Date(NOW.getTime() - 31 * DAY_MS) });
    const jobId = `insight-${purgedUserId}-2026-01-01`;
    const jobFailedRow = await prisma.auditLog.create({
      data: {
        actorRole: 'system',
        action: 'job.failed',
        entityType: 'job',
        entityId: jobId,
        metadata: { queue: 'insight.generate', jobName: 'insight-generate', jobId, attemptsMade: 3, errorName: 'Error' },
      },
    });

    await runCleanupExpired({ now: NOW, archiveDir: await newArchiveDir() });

    const after = await prisma.auditLog.findUniqueOrThrow({ where: { id: jobFailedRow.id } });
    expect(after.entityId).toBeNull();
    expect(after.action).toBe('job.failed'); // action/createdAt/entityType survive.
    expect(after.entityType).toBe('job');
    const meta = after.metadata as { jobId?: string; queue?: string; anonymized?: boolean };
    expect(meta.jobId).toBeUndefined();
    expect(meta.queue).toBe('insight.generate'); // non-PII metadata keys survive.
    expect(meta.anonymized).toBe(true);

    // Idempotent: a 2nd run is a no-op on this already-anonymised row (entity_id/metadata.jobId are
    // already gone, so the LIKE-based WHERE no longer matches it).
    await runCleanupExpired({ now: NOW, archiveDir: await newArchiveDir() });
    const secondRun = await prisma.auditLog.findUniqueOrThrow({ where: { id: jobFailedRow.id } });
    expect(secondRun).toEqual(after);

    await prisma.auditLog.delete({ where: { id: jobFailedRow.id } });
  });

  it("Fix 6: a job.failed row for a DIFFERENT user (jobId doesn't contain this userId) is left untouched", async () => {
    const purgedUserId = await createUser({ status: 'disabled', deletedAt: new Date(NOW.getTime() - 31 * DAY_MS) });
    const otherUserId = randomUUID();
    const jobId = `insight-${otherUserId}-2026-01-01`;
    const jobFailedRow = await prisma.auditLog.create({
      data: {
        actorRole: 'system',
        action: 'job.failed',
        entityType: 'job',
        entityId: jobId,
        metadata: { queue: 'insight.generate', jobId },
      },
    });

    await runCleanupExpired({ now: NOW, archiveDir: await newArchiveDir() });

    const after = await prisma.auditLog.findUniqueOrThrow({ where: { id: jobFailedRow.id } });
    expect(after.entityId).toBe(jobId);
    expect((after.metadata as { jobId?: string }).jobId).toBe(jobId);
    expect((after.metadata as { anonymized?: boolean }).anonymized).toBeUndefined();

    // `purgedUserId` itself must still be purged normally by this same run.
    expect(await prisma.user.findUnique({ where: { id: purgedUserId } })).toBeNull();

    await prisma.auditLog.delete({ where: { id: jobFailedRow.id } });
  });

  // ---- Step 5: audit-log archive ----------------------------------------------------------------

  it('archives an audit row older than 13 months to a gunzip-able file and deletes it from the DB; keeps an 11-month-old row', async () => {
    const oldRow = await prisma.auditLog.create({
      data: { action: 'auth.login.success', actorRole: 'student', createdAt: new Date(NOW.getTime() - 13 * 30 * DAY_MS) },
    });
    const recentRow = await prisma.auditLog.create({
      data: { action: 'auth.login.success', actorRole: 'student', createdAt: new Date(NOW.getTime() - 11 * 30 * DAY_MS) },
    });

    const archiveDir = await newArchiveDir();
    await runCleanupExpired({ now: NOW, archiveDir });

    expect(await prisma.auditLog.findUnique({ where: { id: oldRow.id } })).toBeNull();
    const recentAfter = await prisma.auditLog.findUnique({ where: { id: recentRow.id } });
    expect(recentAfter).not.toBeNull();

    const files = await readdir(archiveDir);
    const archiveFile = files.find((f) => f.endsWith('.jsonl.gz'));
    expect(archiveFile).toBeDefined();

    const gzipped = await readFile(path.join(archiveDir, archiveFile!));
    const jsonl = await new Promise<string>((resolve, reject) => {
      const gunzip = createGunzip();
      const chunks: Buffer[] = [];
      gunzip.on('data', (c: Buffer) => chunks.push(c));
      gunzip.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      gunzip.on('error', reject);
      gunzip.end(gzipped);
    });
    const archivedIds = jsonl
      .trim()
      .split('\n')
      .map((line) => (JSON.parse(line) as { id: string }).id);
    expect(archivedIds).toContain(oldRow.id.toString());
    expect(archivedIds).not.toContain(recentRow.id.toString());

    await prisma.auditLog.delete({ where: { id: recentRow.id } });
  });

  it("Fix 7: creates a brand-new archive dir 0700 and its .jsonl.gz file 0600 (POSIX only — Windows dev mostly ignores mode bits, per CLAUDE.md)", async () => {
    const oldRow = await prisma.auditLog.create({
      data: { action: 'auth.login.success', actorRole: 'student', createdAt: new Date(NOW.getTime() - 13 * 30 * DAY_MS) },
    });

    // A parent dir that already exists, but the archive dir ITSELF must not — otherwise `mkdir`'s
    // `recursive: true` is a no-op on an already-existing dir and never proves this run's own `mode`.
    const parent = await mkdtemp(path.join(tmpdir(), 'cc-audit-archive-parent-'));
    createdArchiveDirs.push(parent);
    const archiveDir = path.join(parent, 'fresh-archive-dir');

    await runCleanupExpired({ now: NOW, archiveDir });

    const files = await readdir(archiveDir);
    const archiveFile = files.find((f) => f.endsWith('.jsonl.gz'));
    expect(archiveFile).toBeDefined();

    if (process.platform !== 'win32') {
      const dirStat = await stat(archiveDir);
      expect(dirStat.mode & 0o777).toBe(0o700);
      const fileStat = await stat(path.join(archiveDir, archiveFile!));
      expect(fileStat.mode & 0o777).toBe(0o600);
    }

    // Already archived AND deleted from the DB by this same run (Step 5) — nothing left to clean up.
    expect(await prisma.auditLog.findUnique({ where: { id: oldRow.id } })).toBeNull();
  });
});
