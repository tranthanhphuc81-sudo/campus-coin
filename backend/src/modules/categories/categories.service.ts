/**
 * categories.service.ts
 * Business logic for income/expense categories: list (system defaults + own), create, update,
 * delete/archive/reassign, and the `assertUsableCategory` check reused by the transactions module
 * (BR-TX-03). Every function takes `userId` from the verified token; a category not owned by the
 * caller is a 404, never a 403 (CLAUDE.md cross-tenant invariant).
 * Main exports: list, create, update, remove, assertUsableCategory
 * Spec: docs/spec/05a §5.3 · Rules: BR-CA-01..05, BR-TX-03
 */
import {
  CATEGORIES_CACHE_TTL_SEC,
  CATEGORY_PERSONAL_MAX,
  SYSTEM_OWNER_KEY,
  type CategoryDto,
  type CreateCategoryInput,
  type DeleteCategoryQueryInput,
  type ListCategoriesQueryInput,
  type TransactionType,
  type UpdateCategoryInput,
} from '@campuscoin/shared';
import type { CategoriesKeyScope, CategoriesKeyType } from '../../lib/cacheKeys.js';
import { categoriesKey, categoriesPattern } from '../../lib/cacheKeys.js';
import { cacheDelByPattern, cacheGet, cacheSet } from '../../lib/cache.js';
import { firstDayOfMonth, fromDbDate } from '../../lib/dates.js';
import { conflict, notFound, validationFailed } from '../../lib/problem.js';
import { prisma } from '../../lib/prisma.js';
import { emitAfterCommit } from '../../events/bus.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { CategoryModel } from '../../generated/prisma/models/Category.js';
import { toSnapshot } from '../transactions/history.js';
import { categoriesRepository, type Db } from './categories.repository.js';
import { toCategoryDto } from './categories.mapper.js';

/**
 * D1: active default categories + the caller's own categories (own archived ones too when
 * `includeInactive` is set). Cached per `userId`/`type`/scope (P09/P12 must reuse the same key
 * builders when they invalidate it).
 */
export async function list(userId: string, query: ListCategoriesQueryInput): Promise<CategoryDto[]> {
  const keyType: CategoriesKeyType = query.type ?? 'all';
  const scope: CategoriesKeyScope = query.includeInactive ? 'all' : 'active';
  const key = categoriesKey(userId, keyType, scope);

  const cached = await cacheGet<CategoryDto[]>(key);
  if (cached) return cached;

  const rows = await categoriesRepository.listVisible(userId, query.type, query.includeInactive);
  const dtos = rows.map(toCategoryDto);
  await cacheSet(key, dtos, CATEGORIES_CACHE_TTL_SEC);
  return dtos;
}

/**
 * Creates a personal category.
 * @throws {AppError} 409 conflict on a name clash (own category or same-type default, BR-CA-01)
 *   or when the caller already owns {@link CATEGORY_PERSONAL_MAX} categories (BR-CA-04).
 */
export async function create(userId: string, input: CreateCategoryInput): Promise<CategoryDto> {
  const owned = await categoriesRepository.countOwned(userId);
  if (owned >= CATEGORY_PERSONAL_MAX) {
    throw conflict(`You can have at most ${CATEGORY_PERSONAL_MAX} personal categories.`);
  }

  const clash = await categoriesRepository.findNameClash(input.type, input.name, [userId, SYSTEM_OWNER_KEY]);
  if (clash) throw conflict('A category with this name already exists.');

  const created = await categoriesRepository.create({
    userId,
    ownerKey: userId,
    name: input.name,
    type: input.type,
    icon: input.icon ?? null,
    color: input.color ?? null,
  });

  await cacheDelByPattern(categoriesPattern(userId));
  return toCategoryDto(created);
}

/**
 * Updates one of the caller's own personal categories (BR-CA-02: a default category's real id 404s
 * here, since {@link categoriesRepository.findOwned} never matches `userId: null` rows).
 * @throws {AppError} 404 when not found/not owned; 409 conflict on a name clash.
 */
export async function update(userId: string, id: number, input: UpdateCategoryInput): Promise<CategoryDto> {
  const current = await categoriesRepository.findOwned(id, userId);
  if (!current) throw notFound('Category not found.');

  if (input.name !== undefined && input.name !== current.name) {
    const clash = await categoriesRepository.findNameClash(current.type as TransactionType, input.name, [userId, SYSTEM_OWNER_KEY], id);
    if (clash) throw conflict('A category with this name already exists.');
  }

  const updated = await categoriesRepository.updateOwned(id, userId, {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.icon !== undefined ? { icon: input.icon } : {}),
    ...(input.color !== undefined ? { color: input.color } : {}),
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
  });
  if (!updated) throw notFound('Category not found.'); // B-M1: repository-level race guard, same 404 as the findOwned check above.

  await cacheDelByPattern(categoriesPattern(userId));
  return toCategoryDto(updated);
}

/**
 * Validates `reassignTo` for {@link remove}: must be a different, usable (active, same-type)
 * category — field errors are reported as `reassignTo`, not the generic `categoryId` used by
 * {@link assertUsableCategory} (this is a query-param check, not a body field).
 */
async function assertReassignTarget(userId: string, targetId: number, type: TransactionType, excludeId: number): Promise<CategoryModel> {
  if (targetId === excludeId) {
    throw validationFailed([{ field: 'reassignTo', message: 'reassignTo must be a different category.' }]);
  }
  const target = await categoriesRepository.findUsable(targetId, [userId, SYSTEM_OWNER_KEY], type, true);
  if (!target) throw validationFailed([{ field: 'reassignTo', message: 'Target category not found.' }]);
  return target;
}

/**
 * D13/D14: moves every transaction and recurring rule referencing `oldCategory` to `newCategoryId`,
 * writes one `update` history row per affected transaction, then hard-deletes the now-empty
 * category — all inside one `$transaction`. Emits ONE `transactions.bulkRecategorized` event (not
 * `transaction.updated` — this is a bulk, synthetic operation with no single real transaction id/
 * amount/type, so it must never be mistaken for the real per-transaction event other domain-event
 * listeners act on) carrying every distinct affected month, after commit.
 */
async function reassignAndDelete(userId: string, oldCategory: CategoryModel, newCategoryId: number): Promise<void> {
  const affected = await prisma.$transaction(async (tx) => {
    const rows = await tx.transaction.findMany({ where: { userId, categoryId: oldCategory.id } });

    if (rows.length > 0) {
      await tx.transaction.updateMany({
        where: { userId, categoryId: oldCategory.id },
        data: { categoryId: newCategoryId, version: { increment: 1 } },
      });
      await tx.transactionHistory.createMany({
        data: rows.map((row) => ({
          transactionId: row.id,
          userId,
          action: 'update' as const,
          snapshot: toSnapshot({ ...row, categoryId: newCategoryId, version: row.version + 1 }) as Prisma.InputJsonValue,
          changedFields: { categoryId: row.categoryId } as Prisma.InputJsonValue,
          changedBy: userId,
        })),
      });
    }

    await tx.recurringRule.updateMany({ where: { userId, categoryId: oldCategory.id }, data: { categoryId: newCategoryId } });
    // B-M1: userId-scoped delete inside the same transaction, not a bare `where: { id }`.
    await categoriesRepository.deleteOwned(oldCategory.id, userId, tx);

    return rows;
  });

  const months = [...new Set(affected.map((row) => firstDayOfMonth(fromDbDate(row.txnDate))))];
  if (months.length > 0) {
    emitAfterCommit('transactions.bulkRecategorized', { userId, months, fromCategoryId: oldCategory.id, toCategoryId: newCategoryId });
  }
}

/**
 * Deletes, archives, or reassigns-then-deletes one of the caller's own categories (BR-CA-03).
 * @returns `undefined` when the category was deleted (controller responds 204); the updated DTO
 *   when it was archived instead (controller responds 200).
 * @throws {AppError} 404 when not found/not owned; 409 conflict when in use with neither
 *   `reassignTo` nor `archive` (or when budgets reference it — those are never auto-migrated);
 *   422 when `reassignTo` is invalid.
 */
export async function remove(userId: string, id: number, query: DeleteCategoryQueryInput): Promise<CategoryDto | undefined> {
  const current = await categoriesRepository.findOwned(id, userId);
  if (!current) throw notFound('Category not found.');

  if (query.archive) {
    const archived = await categoriesRepository.updateOwned(id, userId, { isActive: false });
    if (!archived) throw notFound('Category not found.'); // B-M1: repository-level race guard.
    await cacheDelByPattern(categoriesPattern(userId));
    return toCategoryDto(archived);
  }

  const usage = await categoriesRepository.usage(id, { userId });
  // TODO(p09): Budget rows are never auto-migrated by delete/reassign; the Budget FK to Category
  // is RESTRICT, so this must stay a hard block until the Budget module ships and can migrate them.
  if (usage.budgets > 0) {
    throw conflict('Archive this category instead — it still has budgets set.');
  }

  if (query.reassignTo !== undefined) {
    const target = await assertReassignTarget(userId, query.reassignTo, current.type as TransactionType, id);
    await reassignAndDelete(userId, current, target.id);
    await cacheDelByPattern(categoriesPattern(userId));
    return undefined;
  }

  const inUse = usage.transactions > 0 || usage.rules > 0;
  if (inUse) {
    throw conflict('This category is in use. Reassign its transactions to another category, or archive it instead.');
  }

  const deleted = await categoriesRepository.deleteOwned(id, userId);
  if (deleted.count === 0) throw notFound('Category not found.'); // B-M1: repository-level race guard.
  await cacheDelByPattern(categoriesPattern(userId));
  return undefined;
}

/**
 * Non-throwing variant of the ownership/type/active check (P10 D8): used where a stale/invalid
 * category id must be silently dropped rather than block a save — an AI suggestion must never
 * block saving a transaction.
 */
export async function findUsableCategory(
  userId: string,
  categoryId: number,
  type: TransactionType,
  opts: { requireActive: boolean },
  db?: Db,
): Promise<CategoryModel | null> {
  return categoriesRepository.findUsable(categoryId, [userId, SYSTEM_OWNER_KEY], type, opts.requireActive, db);
}

/**
 * Batched equivalent of {@link findUsableCategory}: resolves every distinct id in `categoryIds` in
 * one round trip instead of one query per id (B-L5 perf fix — `imports.service.ts`'s `updateRows`
 * can validate up to `IMPORT_ROWS_PATCH_MAX` row edits in a single call). The caller must still
 * compare each row's own `type` against the returned category's `type` itself, since a single
 * category id may only be valid for one transaction direction.
 * @returns A map from category id to its row, for every id that is usable by `userId` (own
 *   category or system default), omitting ids that don't exist/aren't usable.
 */
export async function findUsableCategoriesBatch(
  userId: string,
  categoryIds: number[],
  opts: { requireActive: boolean },
  db?: Db,
): Promise<Map<number, CategoryModel>> {
  const uniqueIds = [...new Set(categoryIds)];
  if (uniqueIds.length === 0) return new Map();
  const rows = await categoriesRepository.findUsableMany(uniqueIds, [userId, SYSTEM_OWNER_KEY], opts.requireActive, db);
  return new Map(rows.map((row) => [row.id, row]));
}

/**
 * BR-TX-03: checks that `categoryId` may be used on a transaction of `type` for `userId` — either
 * one of the user's own categories or a system default, and (when `opts.requireActive`) currently
 * active. Reused by the transactions module for the main category (D17/D18) so the ownership rule
 * is enforced in exactly one place.
 * @throws {AppError} 422 validation-failed with the generic message "Category not found." for
 *   every failure mode (unknown id, wrong type, another user's category, inactive) — never leaks
 *   which one it was (CLAUDE.md: don't reveal another user's resource existence).
 */
export async function assertUsableCategory(
  userId: string,
  categoryId: number,
  type: TransactionType,
  opts: { requireActive: boolean },
  db?: Db,
): Promise<CategoryModel> {
  const category = await findUsableCategory(userId, categoryId, type, opts, db);
  if (!category) throw validationFailed([{ field: 'categoryId', message: 'Category not found.' }]);
  return category;
}
