/**
 * admin-categories.repository.ts
 * Tiny Prisma access for creating a system-default category (`userId: null`) — a shape the
 * existing `categoriesRepository.create` (student personal categories) cannot express, since its
 * `CreateCategoryData` interface requires `userId: string` (CLAUDE.md: never weaken that type just
 * to also cover this admin-only case). Reads/updates/usage/name-clash checks reuse
 * `categoriesRepository` directly — a default category is just a `Category` row with
 * `ownerKey: SYSTEM_OWNER_KEY`.
 * Main exports: adminCategoriesRepository, CreateDefaultCategoryData
 * Spec: docs/spec/05c §5.13 · Rules: BR-CA-05
 */
import { SYSTEM_OWNER_KEY, type TransactionType } from '@campuscoin/shared';
import type { CategoryModel } from '../../generated/prisma/models/Category.js';
import type { AppPrismaClient } from '../../lib/prisma.js';
import { prisma } from '../../lib/prisma.js';

/** Fields accepted by {@link adminCategoriesRepository.createDefault}. */
export interface CreateDefaultCategoryData {
  name: string;
  type: TransactionType;
  icon?: string | null;
  color?: string | null;
}

export const adminCategoriesRepository = {
  /** Creates a system-default category (`userId: null`, `ownerKey: SYSTEM_OWNER_KEY`, `isDefault: true`). */
  createDefault(data: CreateDefaultCategoryData, db: AppPrismaClient = prisma): Promise<CategoryModel> {
    return db.category.create({
      data: {
        userId: null,
        ownerKey: SYSTEM_OWNER_KEY,
        name: data.name,
        type: data.type,
        icon: data.icon ?? null,
        color: data.color ?? null,
        isDefault: true,
      },
    });
  },
};
