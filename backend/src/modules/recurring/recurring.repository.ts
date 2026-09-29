/**
 * recurring.repository.ts
 * Prisma access for recurring transaction rules. Every function that targets a *specific user's*
 * rule takes `userId` and scopes by it directly in the `WHERE` clause (CLAUDE.md: never trust
 * client params for ownership) — `updateOwned`/`deleteOwned` use `updateMany`/
 * `deleteMany({ where: { id, userId } })` so a rule owned by another user can never be touched
 * through them, even if a future caller forgets the service-layer `findOwned` check (B-M1). The
 * `findDueBatch`/`advance` pair is the only exception: the daily `recurring.materialize` job
 * processes every user's rules, so those two functions are NOT scoped by a single `userId`.
 * Main exports: recurringRepository, Db, CreateRecurringRuleData, UpdateRecurringRuleData,
 *   RecurringRuleDueRow
 * Spec: docs/spec/05a §5.4.2 (recurring transactions)
 */
import type { RecurringFrequency, TransactionType } from '@campuscoin/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import type { UserStatus } from '../../generated/prisma/enums.js';
import type { AppPrismaClient } from '../../lib/prisma.js';
import { prisma } from '../../lib/prisma.js';
import type { Decimal } from '../../lib/money.js';
import type { RecurringRuleWithCategory } from './recurring.mapper.js';

/** Either the shared client or a transaction handle — every method accepts both. */
export type Db = AppPrismaClient | Prisma.TransactionClient;

/** Fields accepted by {@link recurringRepository.create}. */
export interface CreateRecurringRuleData {
  userId: string;
  categoryId: number;
  type: TransactionType;
  amount: Decimal;
  description: string | null;
  frequency: RecurringFrequency;
  intervalCount: number;
  dayOfMonth: number | null;
  dayOfWeek: number | null;
  startDate: Date;
  endDate: Date | null;
  nextRunDate: Date;
}

/** Partial update accepted by {@link recurringRepository.update} (never `userId`/`startDate`/`type`). */
export interface UpdateRecurringRuleData {
  categoryId?: number;
  amount?: Decimal;
  description?: string | null;
  frequency?: RecurringFrequency;
  intervalCount?: number;
  dayOfMonth?: number | null;
  dayOfWeek?: number | null;
  endDate?: Date | null;
  nextRunDate?: Date;
  isActive?: boolean;
}

/** The subset of `User` fields the materialize job needs to process a due rule. */
export interface RecurringRuleDueRow extends RecurringRuleWithCategory {
  user: { id: string; timezone: string; currency: string; status: UserStatus };
}

export const recurringRepository = {
  /** Every rule the caller owns, newest first, with its category joined. */
  listOwned(userId: string, db: Db = prisma): Promise<RecurringRuleWithCategory[]> {
    return db.recurringRule.findMany({ where: { userId }, include: { category: true }, orderBy: { createdAt: 'desc' } });
  },

  /** A rule owned by `userId` — null for another user's rule (gives the 404). */
  findOwned(id: number, userId: string, db: Db = prisma): Promise<RecurringRuleWithCategory | null> {
    return db.recurringRule.findFirst({ where: { id, userId }, include: { category: true } });
  },

  /** Number of rules a user owns (active or paused) — RECURRING_RULES_MAX anti-abuse cap. */
  countOwned(userId: string, db: Db = prisma): Promise<number> {
    return db.recurringRule.count({ where: { userId } });
  },

  /** Creates a recurring rule. */
  create(data: CreateRecurringRuleData, db: Db = prisma): Promise<RecurringRuleWithCategory> {
    return db.recurringRule.create({ data, include: { category: true } });
  },

  /**
   * Applies a partial update to a rule owned by `userId` (B-M1: the repository itself enforces
   * ownership via `updateMany({ where: { id, userId } })` — the caller no longer has to be trusted
   * to have checked `findOwned` first).
   * @returns The updated row, or `null` when `id` doesn't exist or isn't owned by `userId`.
   */
  async updateOwned(id: number, userId: string, data: UpdateRecurringRuleData, db: Db = prisma): Promise<RecurringRuleWithCategory | null> {
    const result = await db.recurringRule.updateMany({ where: { id, userId }, data });
    if (result.count === 0) return null;
    return db.recurringRule.findFirst({ where: { id, userId }, include: { category: true } });
  },

  /**
   * Hard-deletes a rule owned by `userId` (B-M1: scoped by `userId` in the `WHERE` clause itself,
   * see {@link updateOwned}). Transactions it generated survive via `SetNull`.
   * @returns The number of rows deleted (`0` when `id` doesn't exist or isn't owned by `userId`).
   */
  deleteOwned(id: number, userId: string, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.recurringRule.deleteMany({ where: { id, userId } });
  },

  /**
   * Forecast-only (P14 §5.14): every active rule of `userId` that could still generate an
   * occurrence overlapping `[rangeStart, rangeEnd]` — `startDate <= rangeEnd` AND
   * (`endDate` is null OR `endDate >= rangeStart`). The caller (`forecast.service.ts`) still has to
   * run `countOccurrencesInRange` per rule to know exactly how many times (0 is possible: e.g. a
   * monthly rule whose day-of-month falls just outside the window on both sides of it).
   */
  activeRulesForRange(userId: string, rangeStart: Date, rangeEnd: Date, db: Db = prisma): Promise<RecurringRuleWithCategory[]> {
    return db.recurringRule.findMany({
      where: { userId, isActive: true, startDate: { lte: rangeEnd }, OR: [{ endDate: null }, { endDate: { gte: rangeStart } }] },
      include: { category: true },
    });
  },

  /**
   * Job-only: a page of active rules due on/before `maxUtcDate`, ordered by id for stable
   * pagination, joined with the owning user's timezone/currency/status and category. Not scoped
   * by `userId` — the daily job processes every user's rules in one run.
   */
  findDueBatch(maxUtcDate: Date, cursorId: number, take: number, db: Db = prisma): Promise<RecurringRuleDueRow[]> {
    return db.recurringRule.findMany({
      where: { isActive: true, nextRunDate: { lte: maxUtcDate }, id: { gt: cursorId } },
      include: {
        user: { select: { id: true, timezone: true, currency: true, status: true } },
        category: true,
      },
      orderBy: { id: 'asc' },
      take,
    }) as Promise<RecurringRuleDueRow[]>;
  },

  /**
   * Job-only: advances a rule after materializing its due window. When there is no further
   * occurrence (`nextRunDate: null` from the caller), the last computed occurrence date is
   * written back instead (the column is NOT NULL) — harmless since `isActive` is also set to
   * `false`, so the job's `isActive: true` filter skips it on every future run.
   *
   * The write is conditional on `originalNextRunDate` — the `nextRunDate` value the processor
   * originally read for this rule from `findDueBatch` — still matching the row's current value.
   * The job processes up to 200 rules per page sequentially; if a user pauses or edits this rule
   * while the job is mid-batch, this `updateMany` matches zero rows instead of blindly
   * re-activating a paused rule / overwriting a freshly recomputed `nextRunDate`. The caller must
   * check `count` and skip advancing (log + move on) when it is 0.
   */
  advance(
    id: number,
    originalNextRunDate: Date,
    nextRunDate: Date | null,
    lastOccurrence: Date,
    isActive: boolean,
    db: Db = prisma,
  ): Promise<Prisma.BatchPayload> {
    return db.recurringRule.updateMany({
      where: { id, nextRunDate: originalNextRunDate },
      data: { nextRunDate: nextRunDate ?? lastOccurrence, isActive },
    });
  },
};
