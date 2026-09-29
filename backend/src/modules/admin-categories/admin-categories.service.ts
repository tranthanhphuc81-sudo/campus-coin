/**
 * admin-categories.service.ts
 * Business logic for admin CRUD of system-default categories. Mirrors
 * `categories.service.ts`'s student-facing rules, scoped to defaults only (`SYSTEM_OWNER_KEY`).
 * BR-CA-05: a default category with ANY usage anywhere in the system (any user's transactions,
 * recurring rules or budgets) is never hard-deleted — only archived.
 * Main exports: list, create, update, remove
 * Spec: docs/spec/05c §5.13 · docs/spec/07 §7.3.4 · Rules: BR-CA-01, BR-CA-05
 */
import {
  SYSTEM_OWNER_KEY,
  type CategoryDto,
  type CreateCategoryInput,
  type TransactionType,
  type UpdateCategoryInput,
} from '@campuscoin/shared';
import { Prisma } from '../../generated/prisma/client.js';
import { cacheDelByPattern } from '../../lib/cache.js';
import { categoriesGlobalPattern } from '../../lib/cacheKeys.js';
import { conflict, notFound } from '../../lib/problem.js';
import { prisma } from '../../lib/prisma.js';
import { categoriesRepository } from '../categories/categories.repository.js';
import { toCategoryDto } from '../categories/categories.mapper.js';
import { adminCategoriesRepository } from './admin-categories.repository.js';

/** `GET /admin/categories` — every default category (active and archived), optionally filtered by `type`. */
export async function list(type?: TransactionType): Promise<CategoryDto[]> {
  const rows = await categoriesRepository.listAllDefaults(type);
  return rows.map(toCategoryDto);
}

/**
 * Creates a new system-default category.
 * @throws {AppError} 409 conflict on a same-type/name clash among existing default categories.
 */
export async function create(input: CreateCategoryInput): Promise<CategoryDto> {
  const clash = await categoriesRepository.findNameClash(input.type, input.name, [SYSTEM_OWNER_KEY]);
  if (clash) throw conflict('A default category with this name already exists.');

  const created = await adminCategoriesRepository.createDefault({
    name: input.name,
    type: input.type,
    icon: input.icon ?? null,
    color: input.color ?? null,
  });
  await cacheDelByPattern(categoriesGlobalPattern());
  return toCategoryDto(created);
}

/**
 * Updates a system-default category.
 * @throws {AppError} 404 when `id` is not a default category (BR-CA-05: never leaks whether it is
 *   instead some student's personal category); 409 on a name clash.
 */
export async function update(id: number, input: UpdateCategoryInput): Promise<CategoryDto> {
  const current = await categoriesRepository.findDefaultById(id);
  if (!current) throw notFound('Category not found.');

  if (input.name !== undefined && input.name !== current.name) {
    const clash = await categoriesRepository.findNameClash(
      current.type as TransactionType,
      input.name,
      [SYSTEM_OWNER_KEY],
      id,
    );
    if (clash) throw conflict('A default category with this name already exists.');
  }

  const updated = await categoriesRepository.updateDefault(id, {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.icon !== undefined ? { icon: input.icon } : {}),
    ...(input.color !== undefined ? { color: input.color } : {}),
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
  });
  if (!updated) throw notFound('Category not found.'); // B-M1: repository-level race guard.
  await cacheDelByPattern(categoriesGlobalPattern());
  return toCategoryDto(updated);
}

/**
 * Archives, or (only when truly unused) hard-deletes a system-default category.
 * @returns `undefined` when hard-deleted (controller responds 204); the updated DTO when archived
 *   (controller responds 200).
 * @throws {AppError} 404 when `id` is not a default category; 409 when in use anywhere in the
 *   system and `archive` was not requested (BR-CA-05), including a live FK-restrict race between
 *   the usage check and the delete itself (Fix 7).
 */
export async function remove(id: number, archive: boolean): Promise<CategoryDto | undefined> {
  const current = await categoriesRepository.findDefaultById(id);
  if (!current) throw notFound('Category not found.');

  if (archive) {
    const archived = await categoriesRepository.updateDefault(id, { isActive: false });
    if (!archived) throw notFound('Category not found.'); // B-M1: repository-level race guard.
    await cacheDelByPattern(categoriesGlobalPattern());
    return toCategoryDto(archived);
  }

  // Fix 7: `categoriesRepository.usage()` doesn't count `ai_category_rules` (its FK is
  // `onDelete: Cascade`, unlike transactions/rules/budgets which are `Restrict`) — a personal
  // learned-categorization rule still pointing at this default would otherwise be silently
  // cascade-deleted for every affected user. Only the ADMIN delete path needs this extra count, so
  // it is a local query here rather than a change to the shared `usage()` used by student deletes.
  const [usage, aiRuleCount] = await Promise.all([
    categoriesRepository.usage(id, { admin: true }),
    prisma.aiCategoryRule.count({ where: { categoryId: id } }),
  ]);
  const inUse = usage.transactions + usage.rules + usage.budgets + aiRuleCount > 0;
  if (inUse) {
    throw conflict('This default category is in use. Archive it instead (?archive=true).');
  }

  try {
    const deleted = await categoriesRepository.deleteDefault(id);
    if (deleted.count === 0) throw notFound('Category not found.'); // B-M1: repository-level race guard.
  } catch (err) {
    // Fix 7: a transaction/rule/budget/rule created between the check above and this delete can
    // still hit a live P2003 FK-restrict violation — surface it as a clean 409 instead of letting
    // errorHandler's generic Prisma-error fallback leak the raw code (tracked separately for P19).
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
      throw conflict('This category is now in use — archive it instead.');
    }
    throw err;
  }
  await cacheDelByPattern(categoriesGlobalPattern());
  return undefined;
}
