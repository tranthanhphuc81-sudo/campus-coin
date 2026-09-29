/**
 * transactions.repository.ts
 * Prisma access for income/expense transactions. Every method that targets a *specific user's*
 * data takes `userId` and scopes by it (CLAUDE.md: never trust client params for ownership) —
 * a transaction owned by another user is simply never matched, which is how the service layer
 * turns cross-tenant access into a 404 instead of a 403.
 * Main exports: transactionsRepository, TransactionFilters, InsertTransactionData, InsertHistoryData
 * Spec: docs/spec/05a §5.4 · docs/spec/07 §7.3.2 · Rules: BR-TX-01..08
 */
import {
  ANOMALY_PEER_SAMPLE_MAX,
  DUPLICATE_CANDIDATES_MAX,
  TRASH_RETENTION_DAYS,
  type CategorySource,
  type TransactionSource,
  type TransactionType,
} from '@campuscoin/shared';
import type { HistoryAction } from '../../generated/prisma/enums.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { TransactionHistoryModel } from '../../generated/prisma/models/TransactionHistory.js';
import type { Decimal } from '../../lib/money.js';
import type { AppPrismaClient } from '../../lib/prisma.js';
import { prisma } from '../../lib/prisma.js';
import { toDbDate, type LocalDate } from '../../lib/dates.js';
import type { TransactionWithCategory } from './transactions.mapper.js';

/** Either the shared client or a transaction handle — every method accepts both. */
type Db = AppPrismaClient | Prisma.TransactionClient;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Parsed filters for `GET /transactions` (already Zod-validated at the API edge). */
export interface TransactionFilters {
  from?: LocalDate;
  to?: LocalDate;
  type?: TransactionType;
  categoryId?: number[];
  q?: string;
  minAmount?: string;
  maxAmount?: string;
  /** `true` = only soft-deleted rows within the trash retention window; `false` = only active rows. */
  deleted: boolean;
}

/** Accepted sort values of `listTransactionsQuerySchema`. */
export type TransactionSort = 'txnDate' | '-txnDate' | 'amount' | '-amount' | 'createdAt' | '-createdAt';

/** Data accepted by {@link transactionsRepository.insert} (flat scalar FKs, per Prisma's Unchecked* input). */
export interface InsertTransactionData {
  userId: string;
  categoryId: number;
  type: TransactionType;
  amount: Decimal;
  currency: string;
  description: string | null;
  merchantKey: string | null;
  txnDate: Date;
  source: TransactionSource;
  categorySource: CategorySource;
  aiSuggestedCategoryId: number | null;
  aiConfidence: Decimal | null;
  recurringRuleId: number | null;
  recurringPeriod: string | null;
}

/** Fields updateable by {@link transactionsRepository.updateVersioned} (never `version` itself — that is always `{ increment: 1 }`). */
export interface UpdateTransactionData {
  categoryId?: number;
  type?: TransactionType;
  amount?: Decimal;
  description?: string | null;
  merchantKey?: string | null;
  txnDate?: Date;
  categorySource?: CategorySource;
  aiSuggestedCategoryId?: number | null;
  aiConfidence?: Decimal | null;
}

/** Data accepted by {@link transactionsRepository.insertHistory}. */
export interface InsertHistoryData {
  transactionId: string;
  userId: string;
  action: HistoryAction;
  snapshot: Prisma.InputJsonValue;
  changedFields: Prisma.InputJsonValue | null;
  changedBy: string;
}

/** Sort keys mapped to Prisma `orderBy` clauses; `id desc` is always appended as a stable tiebreaker. */
const SORT_MAP: ReadonlyMap<TransactionSort, Prisma.TransactionOrderByWithRelationInput> = new Map([
  ['txnDate', { txnDate: 'asc' }],
  ['-txnDate', { txnDate: 'desc' }],
  ['amount', { amount: 'asc' }],
  ['-amount', { amount: 'desc' }],
  ['createdAt', { createdAt: 'asc' }],
  ['-createdAt', { createdAt: 'desc' }],
]);

function buildOrderBy(sort: TransactionSort): Prisma.TransactionOrderByWithRelationInput[] {
  const primary = SORT_MAP.get(sort) ?? { txnDate: 'desc' as const };
  return [primary, { id: 'desc' }];
}

/**
 * Escapes MySQL `LIKE` metacharacters (`%`, `_`, `\`) in a user-supplied search term so a literal
 * "50%" search matches literally instead of being interpreted as a wildcard (BR-TX-08). MySQL's
 * default `LIKE` escape character is backslash, which Prisma's `contains` does not apply itself.
 */
function escapeLike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/** Builds the `where` clause shared by `list` and `count`. */
function buildWhere(userId: string, filters: TransactionFilters, now: Date): Prisma.TransactionWhereInput {
  const where: Prisma.TransactionWhereInput = { userId };

  if (filters.deleted) {
    const cutoff = new Date(now.getTime() - TRASH_RETENTION_DAYS * MS_PER_DAY);
    where.deletedAt = { not: null, gte: cutoff };
  } else {
    where.deletedAt = null;
  }

  if (filters.type) where.type = filters.type;
  if (filters.categoryId && filters.categoryId.length > 0) where.categoryId = { in: filters.categoryId };
  if (filters.from || filters.to) {
    where.txnDate = {
      ...(filters.from ? { gte: toDbDate(filters.from) } : {}),
      ...(filters.to ? { lte: toDbDate(filters.to) } : {}),
    };
  }
  if (filters.q) where.description = { contains: escapeLike(filters.q) };
  if (filters.minAmount !== undefined || filters.maxAmount !== undefined) {
    where.amount = {
      ...(filters.minAmount !== undefined ? { gte: filters.minAmount } : {}),
      ...(filters.maxAmount !== undefined ? { lte: filters.maxAmount } : {}),
    };
  }

  return where;
}

export const transactionsRepository = {
  /** An active (not soft-deleted) transaction owned by `userId`, with its category joined. */
  findActiveOwned(id: string, userId: string, db: Db = prisma): Promise<TransactionWithCategory | null> {
    return db.transaction.findFirst({ where: { id, userId, deletedAt: null }, include: { category: true } });
  },

  /** A transaction owned by `userId`, active or soft-deleted (D6: `/history` and `/restore` accept both). */
  findOwnedAny(id: string, userId: string, db: Db = prisma): Promise<TransactionWithCategory | null> {
    return db.transaction.findFirst({ where: { id, userId }, include: { category: true } });
  },

  /** Paginated, filtered, sorted list of a user's transactions. */
  list(
    userId: string,
    filters: TransactionFilters,
    skip: number,
    take: number,
    sort: TransactionSort,
    now: Date = new Date(),
    db: Db = prisma,
  ): Promise<TransactionWithCategory[]> {
    return db.transaction.findMany({
      where: buildWhere(userId, filters, now),
      include: { category: true },
      orderBy: buildOrderBy(sort),
      skip,
      take,
    });
  },

  /** Total count matching the same filters as {@link list} (for pagination `meta`). */
  count(userId: string, filters: TransactionFilters, now: Date = new Date(), db: Db = prisma): Promise<number> {
    return db.transaction.count({ where: buildWhere(userId, filters, now) });
  },

  /** Inserts a new transaction (flat scalar FKs). */
  insert(data: InsertTransactionData, db: Db = prisma): Promise<TransactionWithCategory> {
    return db.transaction.create({ data, include: { category: true } });
  },

  /**
   * Race-safe versioned update: only succeeds if `id`/`userId`/`version` still match and the row
   * is not soft-deleted (BR-TX-05 optimistic locking). `version` is always bumped by 1.
   */
  updateVersioned(
    id: string,
    userId: string,
    expectedVersion: number,
    data: UpdateTransactionData,
    db: Db = prisma,
  ): Promise<Prisma.BatchPayload> {
    return db.transaction.updateMany({
      where: { id, userId, version: expectedVersion, deletedAt: null },
      data: { ...data, version: { increment: 1 } },
    });
  },

  /** Race-safe soft delete: only succeeds if the row is not already deleted (BR-TX-07). */
  softDelete(id: string, userId: string, now: Date, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.transaction.updateMany({
      where: { id, userId, deletedAt: null },
      data: { deletedAt: now, version: { increment: 1 } },
    });
  },

  /** Race-safe restore: only succeeds if the row is currently soft-deleted. */
  restore(id: string, userId: string, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.transaction.updateMany({
      where: { id, userId, deletedAt: { not: null } },
      data: { deletedAt: null, version: { increment: 1 } },
    });
  },

  /**
   * Inserts one append-only history row. `changedFields: null` is translated to `Prisma.DbNull`
   * (setting the JSON column to SQL NULL) — Prisma's create input does not accept a bare `null`
   * for a nullable Json field, since that would be ambiguous with the JSON value `null`.
   */
  insertHistory(row: InsertHistoryData, db: Db = prisma): Promise<TransactionHistoryModel> {
    return db.transactionHistory.create({
      data: {
        transactionId: row.transactionId,
        userId: row.userId,
        action: row.action,
        snapshot: row.snapshot,
        changedFields: row.changedFields ?? Prisma.DbNull,
        changedBy: row.changedBy,
      },
    });
  },

  /**
   * Full history of one transaction, oldest first. The caller MUST verify `transactionId` belongs
   * to `userId` (via {@link findOwnedAny}) first — `transaction_history` has no FK to enforce it.
   */
  listHistory(transactionId: string, userId: string, db: Db = prisma): Promise<TransactionHistoryModel[]> {
    return db.transactionHistory.findMany({ where: { transactionId, userId }, orderBy: { changedAt: 'asc' } });
  },

  /**
   * `{txnDate, amount, description}` of every non-deleted transaction in `[from, to]` (inclusive),
   * for P11's CSV-import duplicate check (`transactionsService.findDuplicateKeys`) — never exposes
   * full rows, just the three fields a duplicate key is built from.
   */
  findForDuplicateCheck(
    userId: string,
    from: Date,
    to: Date,
    db: Db = prisma,
  ): Promise<{ txnDate: Date; amount: Decimal; description: string | null }[]> {
    return db.transaction.findMany({
      where: { userId, deletedAt: null, txnDate: { gte: from, lte: to } },
      select: { txnDate: true, amount: true, description: true },
    });
  },

  /**
   * Race-safe conditional write of `isAnomaly`/`isPossibleDuplicate` (§5.14, D4's `resolve-flag`
   * `keep` and the anomaly/duplicate detector). The `[field]: !value` no-op guard means the write
   * only ever matches when the flag is actually changing — a repeat call (event replay, or two
   * concurrent detector runs) naturally affects 0 rows instead of re-writing the same value, which
   * is how {@link ../transactions.flags.js#applyFlag} stays idempotent without an extra read.
   * `opts.expectedVersion`, when given, additionally guards against a concurrent edit changing the
   * row out from under the detector (BR-TX-05-style optimistic lock, but this method never bumps
   * `version` itself — a flag is metadata, not a user-visible edit).
   */
  setFlag(
    id: string,
    userId: string,
    field: 'isAnomaly' | 'isPossibleDuplicate',
    value: boolean,
    opts: { expectedVersion?: number } = {},
    db: Db = prisma,
  ): Promise<Prisma.BatchPayload> {
    const data = field === 'isAnomaly' ? { isAnomaly: value } : { isPossibleDuplicate: value };
    return db.transaction.updateMany({
      where: {
        id,
        userId,
        deletedAt: null,
        [field]: !value,
        ...(opts.expectedVersion !== undefined ? { version: opts.expectedVersion } : {}),
      },
      data,
    });
  },

  /**
   * Peer expense amounts in the same category over a trailing window, excluding the subject
   * itself. Used by the anomaly detector (§5.14) to build the mean/median/stdDev baseline a new
   * expense is compared against. Callers are responsible for `categoryId` already belonging to an
   * `expense`-type category — this only ever samples `type: 'expense'` peers, so an income
   * category never reaches this query in the first place.
   */
  findAnomalyPeers(
    userId: string,
    categoryId: number,
    excludeId: string,
    from: Date,
    to: Date,
    db: Db = prisma,
  ): Promise<Array<{ amount: Prisma.Decimal }>> {
    return db.transaction.findMany({
      where: { userId, categoryId, type: 'expense', deletedAt: null, id: { not: excludeId }, txnDate: { gte: from, lte: to } },
      select: { amount: true },
      orderBy: { txnDate: 'desc' },
      take: ANOMALY_PEER_SAMPLE_MAX,
    });
  },

  /**
   * Candidate transactions for duplicate detection: same user/amount/type, close in both `txnDate`
   * and `createdAt`, excluding recurring-generated rows (a recurring rule's own repeats are
   * expected to look alike, so they must never be flagged as duplicates of one another).
   */
  findDuplicateCandidates(
    userId: string,
    excludeId: string,
    amount: Prisma.Decimal,
    type: TransactionType,
    txnDateFrom: Date,
    txnDateTo: Date,
    createdAtFrom: Date,
    createdAtTo: Date,
    db: Db = prisma,
  ): Promise<Array<{ id: string; categoryId: number; merchantKey: string | null }>> {
    return db.transaction.findMany({
      where: {
        userId,
        id: { not: excludeId },
        deletedAt: null,
        type,
        amount,
        recurringRuleId: null,
        txnDate: { gte: txnDateFrom, lte: txnDateTo },
        createdAt: { gte: createdAtFrom, lte: createdAtTo },
      },
      select: { id: true, categoryId: true, merchantKey: true },
      orderBy: { createdAt: 'desc' },
      take: DUPLICATE_CANDIDATES_MAX,
    });
  },
};
