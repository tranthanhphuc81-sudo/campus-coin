/**
 * imports.repository.ts
 * Prisma access for CSV import batches (`import_batches`). Every method that targets a specific
 * user's batch takes `userId` and scopes by it (CLAUDE.md: never trust client params for
 * ownership) — a batch owned by another user simply never matches, which is how the service layer
 * turns cross-tenant access into a 404 instead of a 403.
 * Main exports: importsRepository, Db, CreateImportBatchData, SetImportBatchStatusData
 * Spec: docs/spec/05a §5.5 · docs/spec/07 §7.3.2
 */
import { ImportBatchStatus } from '@campuscoin/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import type { ImportBatchModel } from '../../generated/prisma/models/ImportBatch.js';
import type { AppPrismaClient } from '../../lib/prisma.js';
import { prisma } from '../../lib/prisma.js';

/** Either the shared client or a transaction handle — every method accepts both. */
export type Db = AppPrismaClient | Prisma.TransactionClient;

/** Fields accepted by {@link importsRepository.create}. */
export interface CreateImportBatchData {
  userId: string;
  originalFilename: string;
  fileSha256: string;
}

/** Partial update accepted by {@link importsRepository.setStatus} — `status` is always required. */
export interface SetImportBatchStatusData {
  status: ImportBatchStatus;
  totalRows?: number;
  validRows?: number;
  committedRows?: number;
  errorReport?: unknown;
  committedAt?: Date;
}

export const importsRepository = {
  /** Creates a new batch (status defaults to `uploaded`). */
  create(data: CreateImportBatchData, db: Db = prisma): Promise<ImportBatchModel> {
    return db.importBatch.create({ data });
  },

  /** A batch owned by `userId` — never matches another user's row (CLAUDE.md cross-tenant invariant). */
  findOwned(id: string, userId: string, db: Db = prisma): Promise<ImportBatchModel | null> {
    return db.importBatch.findFirst({ where: { id, userId } });
  },

  /** The caller's own previous batch for the same file content, if any (`@@unique([userId, fileSha256])`). */
  findByHash(userId: string, fileSha256: string, db: Db = prisma): Promise<ImportBatchModel | null> {
    return db.importBatch.findUnique({ where: { userId_fileSha256: { userId, fileSha256 } } });
  },

  /**
   * Number of the caller's batches still "open" — uploaded/parsing/previewed, i.e. not yet
   * committed, discarded or expired. B-M3: each open batch holds raw text + a preview in Redis for
   * up to 24h; `imports.service.ts`'s `upload()` uses this to cap how many a user can pile up.
   */
  countOpen(userId: string, db: Db = prisma): Promise<number> {
    return db.importBatch.count({
      where: { userId, status: { in: [ImportBatchStatus.UPLOADED, ImportBatchStatus.PARSING, ImportBatchStatus.PREVIEWED] } },
    });
  },

  /**
   * Hard-deletes a batch that has not been committed (a committed batch is permanent transaction
   * history — `Transaction.importBatchId` has a `Restrict` FK to it).
   * @returns The number of rows deleted (`0` when not found, not owned, or already committed).
   */
  async deleteOwned(id: string, userId: string, db: Db = prisma): Promise<number> {
    const result = await db.importBatch.deleteMany({ where: { id, userId, status: { not: 'committed' } } });
    return result.count;
  },

  /**
   * Race-safe status transition: only succeeds if the batch's current status is one of
   * `fromStatuses`. A return of `0` means someone else already moved it (a concurrent
   * commit/discard/re-parse, or the batch doesn't exist/isn't owned by `userId`) — the caller must
   * treat that as stale/conflicting rather than assuming the write happened.
   */
  async setStatus(
    id: string,
    userId: string,
    fromStatuses: ImportBatchStatus[],
    data: SetImportBatchStatusData,
    db: Db = prisma,
  ): Promise<number> {
    const result = await db.importBatch.updateMany({
      where: { id, userId, status: { in: fromStatuses } },
      data: {
        status: data.status,
        ...(data.totalRows !== undefined ? { totalRows: data.totalRows } : {}),
        ...(data.validRows !== undefined ? { validRows: data.validRows } : {}),
        ...(data.committedRows !== undefined ? { committedRows: data.committedRows } : {}),
        ...(data.errorReport !== undefined ? { errorReport: data.errorReport as Prisma.InputJsonValue } : {}),
        ...(data.committedAt !== undefined ? { committedAt: data.committedAt } : {}),
      },
    });
    return result.count;
  },
};
