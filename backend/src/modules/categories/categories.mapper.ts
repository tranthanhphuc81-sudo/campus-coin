/**
 * categories.mapper.ts
 * Maps a Prisma `Category` row to the public {@link CategoryDto}. The field list is the
 * whitelist — `userId`/`ownerKey` are never sent to the client (CLAUDE.md security invariant).
 * Main exports: toCategoryDto
 * Spec: docs/spec/05a §5.3 (category DTO)
 */
import type { CategoryDto, TransactionType } from '@campuscoin/shared';
import type { CategoryModel } from '../../generated/prisma/models/Category.js';

/**
 * Converts a Prisma `Category` row into the public {@link CategoryDto}.
 * @param category - Full row, as read from the DB (never partially selected).
 */
export function toCategoryDto(category: CategoryModel): CategoryDto {
  return {
    id: category.id,
    name: category.name,
    type: category.type as TransactionType,
    icon: category.icon,
    color: category.color,
    isDefault: category.isDefault,
    isActive: category.isActive,
    sortOrder: category.sortOrder,
  };
}
