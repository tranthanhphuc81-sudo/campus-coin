/**
 * categories.repository.ts
 * Prisma access for income/expense categories: system defaults (`userId: null`) and a user's own
 * personal categories. Every function that targets a *specific user's* row takes `userId` and
 * scopes by it in the `WHERE` clause itself (CLAUDE.md: never trust client params for ownership) —
 * `updateOwned`/`deleteOwned` use `updateMany`/`deleteMany({ where: { id, userId } })` so a default
 * category, or another user's category, can never be mutated through them even if a future caller
 * forgets to check `findOwned` first (B-M1). `updateDefault`/`deleteDefault` are the admin-only
 * mirror, scoped by `ownerKey: SYSTEM_OWNER_KEY` instead.
 * Main exports: categoriesRepository, CreateCategoryData, UpdateCategoryData, CategoryUsage
 * Spec: docs/spec/05a §5.3 · Rules: BR-CA-01..05
 */
import { SYSTEM_OWNER_KEY, type TransactionType } from '@campuscoin/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import type { CategoryModel } from '../../generated/prisma/models/Category.js';
import type { AppPrismaClient } from '../../lib/prisma.js';
import { prisma } from '../../lib/prisma.js';

/** Either the shared client or a transaction handle — every method accepts both. */
export type Db = AppPrismaClient | Prisma.TransactionClient;

/** Fields accepted by {@link categoriesRepository.create}. */
export interface CreateCategoryData {
  userId: string;
  ownerKey: string;
  name: string;
  type: TransactionType;
  icon?: string | null;
  color?: string | null;
}

/** Partial update accepted by {@link categoriesRepository.update}. */
export interface UpdateCategoryData {
  name?: string;
  icon?: string | null;
  color?: string | null;
  isActive?: boolean;
  sortOrder?: number;
}

/** Usage counts used to decide delete/archive/reassign (BR-CA-03, D13). */
export interface CategoryUsage {
  transactions: number;
  rules: number;
  budgets: number;
}

export const categoriesRepository = {
  /**
   * D1: active default categories (system) + the caller's own categories — active-only unless
   * `includeInactive` is set, in which case the caller's own archived categories are included too
   * (inactive *defaults* are never returned, regardless of `includeInactive`).
   */
  listVisible(
    userId: string,
    type: TransactionType | undefined,
    includeInactive: boolean,
    db: Db = prisma,
  ): Promise<CategoryModel[]> {
    return db.category.findMany({
      where: {
        ...(type ? { type } : {}),
        OR: [
          { ownerKey: SYSTEM_OWNER_KEY, isActive: true },
          { userId, ...(includeInactive ? {} : { isActive: true }) },
        ],
      },
      orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
  },

  /** A category owned by `userId` — never matches a default (`userId: null`), enforcing BR-CA-02. */
  findOwned(id: number, userId: string, db: Db = prisma): Promise<CategoryModel | null> {
    return db.category.findFirst({ where: { id, userId } });
  },

  /**
   * Every category among `ids` usable by `ownerKeys` (own categories + defaults), optionally
   * active-only — a batched equivalent of {@link findUsable} so a caller validating many category
   * ids (e.g. `imports.service.ts`'s `updateRows`, up to `IMPORT_ROWS_PATCH_MAX` rows) needs one
   * round trip instead of one query per id (B-L5 perf fix). The caller must still check each
   * result's `type` itself — this does not filter by transaction direction.
   */
  findUsableMany(ids: number[], ownerKeys: string[], requireActive: boolean, db: Db = prisma): Promise<CategoryModel[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return db.category.findMany({
      where: { id: { in: ids }, ownerKey: { in: ownerKeys }, ...(requireActive ? { isActive: true } : {}) },
    });
  },

  /**
   * A category usable by `userId` for a transaction of `type` (own category or system default),
   * optionally requiring it to be active (BR-TX-03/D17).
   */
  findUsable(
    id: number,
    ownerKeys: string[],
    type: TransactionType,
    requireActive: boolean,
    db: Db = prisma,
  ): Promise<CategoryModel | null> {
    return db.category.findFirst({
      where: { id, ownerKey: { in: ownerKeys }, type, ...(requireActive ? { isActive: true } : {}) },
    });
  },

  /**
   * A category visible to `userId` (own category or system default) and currently active,
   * regardless of `type` — used by the AI feedback endpoint (P10), which has no `type` field to
   * narrow by (a merchant key can, in principle, apply to either transaction direction).
   */
  findVisible(id: number, ownerKeys: string[], db: Db = prisma): Promise<CategoryModel | null> {
    return db.category.findFirst({ where: { id, ownerKey: { in: ownerKeys }, isActive: true } });
  },

  /** A same-type category with the same `name` among `ownerKeys` (own categories + defaults), for the uniqueness pre-check (BR-CA-01/D16). */
  findNameClash(
    type: TransactionType,
    name: string,
    ownerKeys: string[],
    excludeId?: number,
    db: Db = prisma,
  ): Promise<CategoryModel | null> {
    return db.category.findFirst({
      where: { type, name, ownerKey: { in: ownerKeys }, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
  },

  /** Number of personal categories a user owns (archived included) — BR-CA-04 anti-abuse cap. */
  countOwned(userId: string, db: Db = prisma): Promise<number> {
    return db.category.count({ where: { userId } });
  },

  /** Creates a personal category. */
  create(data: CreateCategoryData, db: Db = prisma): Promise<CategoryModel> {
    return db.category.create({
      data: {
        userId: data.userId,
        ownerKey: data.ownerKey,
        name: data.name,
        type: data.type,
        icon: data.icon ?? null,
        color: data.color ?? null,
      },
    });
  },

  /**
   * Applies a partial update to a category owned by `userId` (B-M1: scoped by `userId` in the
   * `WHERE` clause itself, not just by a service-layer check one call earlier — a caller that
   * skips that check, e.g. a future admin-module shortcut, still can't touch another user's row).
   * @returns The updated row, or `null` when `id` doesn't exist or isn't owned by `userId`.
   */
  async updateOwned(id: number, userId: string, data: UpdateCategoryData, db: Db = prisma): Promise<CategoryModel | null> {
    const result = await db.category.updateMany({ where: { id, userId }, data });
    if (result.count === 0) return null;
    return db.category.findFirst({ where: { id, userId } });
  },

  /**
   * Hard-deletes a category owned by `userId` (only ever called once {@link usage} confirms it is
   * unused). B-M1: scoped by `userId` in the `WHERE` clause itself (see {@link updateOwned}).
   * @returns The number of rows deleted (`0` when `id` doesn't exist or isn't owned by `userId`).
   */
  deleteOwned(id: number, userId: string, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.category.deleteMany({ where: { id, userId } });
  },

  /**
   * Applies a partial update to a system-default category (admin only). B-M1: scoped by
   * `ownerKey: SYSTEM_OWNER_KEY` in the `WHERE` clause itself, mirroring {@link updateOwned}.
   * @returns The updated row, or `null` when `id` isn't a default category.
   */
  async updateDefault(id: number, data: UpdateCategoryData, db: Db = prisma): Promise<CategoryModel | null> {
    const result = await db.category.updateMany({ where: { id, ownerKey: SYSTEM_OWNER_KEY }, data });
    if (result.count === 0) return null;
    return db.category.findFirst({ where: { id, ownerKey: SYSTEM_OWNER_KEY } });
  },

  /**
   * Hard-deletes a system-default category (admin only, BR-CA-05). B-M1: scoped by
   * `ownerKey: SYSTEM_OWNER_KEY` in the `WHERE` clause itself, mirroring {@link deleteOwned}.
   * @returns The number of rows deleted (`0` when `id` isn't a default category).
   */
  deleteDefault(id: number, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.category.deleteMany({ where: { id, ownerKey: SYSTEM_OWNER_KEY } });
  },

  /**
   * Counts every place a category is still referenced (BR-CA-03: decides delete vs archive vs
   * reassign). `scope` decides whose rows count: an owned (personal) category only ever counts
   * `userId`'s own transactions/rules/budgets, while a default category (admin, BR-CA-05) counts
   * every user's — B-M1: explicit rather than implicitly counting across all users either way.
   */
  async usage(id: number, scope: { userId: string } | { admin: true }, db: Db = prisma): Promise<CategoryUsage> {
    const ownerFilter = 'userId' in scope ? { userId: scope.userId } : {};
    const [transactions, rules, budgets] = await Promise.all([
      db.transaction.count({ where: { categoryId: id, ...ownerFilter } }),
      db.recurringRule.count({ where: { categoryId: id, ...ownerFilter } }),
      db.budget.count({ where: { categoryId: id, ...ownerFilter } }),
    ]);
    return { transactions, rules, budgets };
  },

  /**
   * Every system-default category, active AND inactive (P15: the admin portal must see archived
   * defaults too, unlike {@link listVisible} which only ever surfaces active ones to students).
   */
  listAllDefaults(type: TransactionType | undefined, db: Db = prisma): Promise<CategoryModel[]> {
    return db.category.findMany({
      where: { ownerKey: SYSTEM_OWNER_KEY, ...(type ? { type } : {}) },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  },

  /** A system-default category by id — never matches a personal category (mirrors {@link findOwned}). */
  findDefaultById(id: number, db: Db = prisma): Promise<CategoryModel | null> {
    return db.category.findFirst({ where: { id, ownerKey: SYSTEM_OWNER_KEY } });
  },
};
