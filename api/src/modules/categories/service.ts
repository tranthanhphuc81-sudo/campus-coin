import { CategoryType } from "@prisma/client";

import { conflict, notFound, validationFailed } from "../../lib/problem.js";
import {
  countPersonalCategoriesByType,
  countTransactionsByCategory,
  createPersonalCategory,
  findActiveReassignCandidate,
  findNameConflict,
  findOwnedCategoryById,
  hardDeleteOwnedCategory,
  listActiveCategoriesForUser,
  reassignTransactionsAndArchiveCategory,
  toCategoryType,
  updateOwnedCategory,
} from "./repository.js";
import type {
  CategoryDto,
  CategoryWireType,
  CreateCategoryInput,
  UpdateCategoryInput,
} from "./types.js";

const MAX_PERSONAL_CATEGORIES_PER_TYPE = 50;

function mapTypeToWire(type: CategoryType): CategoryWireType {
  return type === CategoryType.INCOME ? "income" : "expense";
}

function normalizeName(name: string): string {
  return name.trim();
}

function toDto(category: {
  id: number;
  name: string;
  type: CategoryType;
  icon: string | null;
  color: string | null;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
}): CategoryDto {
  return {
    id: category.id,
    name: category.name,
    type: mapTypeToWire(category.type),
    icon: category.icon,
    color: category.color,
    isDefault: category.isDefault,
    isActive: category.isActive,
    sortOrder: category.sortOrder,
  };
}

export async function listCategories(
  userId: string,
  type: CategoryWireType,
): Promise<CategoryDto[]> {
  const categories = await listActiveCategoriesForUser({
    userId,
    type: toCategoryType(type),
  });

  return categories.map(toDto);
}

export async function createCategory(
  userId: string,
  payload: CreateCategoryInput,
): Promise<CategoryDto> {
  const normalizedName = normalizeName(payload.name);
  const categoryType = toCategoryType(payload.type);

  const personalCount = await countPersonalCategoriesByType({
    userId,
    type: categoryType,
  });

  if (personalCount >= MAX_PERSONAL_CATEGORIES_PER_TYPE) {
    throw validationFailed([
      {
        field: "name",
        message: "You can create up to 50 personal categories per type.",
      },
    ]);
  }

  const nameConflict = await findNameConflict({
    userId,
    type: categoryType,
    normalizedName,
  });

  if (nameConflict) {
    throw conflict("Category name already exists for this type.", [
      {
        field: "name",
        message: "Please choose another category name.",
      },
    ]);
  }

  const created = await createPersonalCategory({
    userId,
    name: normalizedName,
    type: categoryType,
    icon: payload.icon,
    color: payload.color,
    sortOrder: payload.sortOrder,
  });

  return toDto(created);
}

export async function patchCategory(
  userId: string,
  categoryId: number,
  payload: UpdateCategoryInput,
): Promise<CategoryDto> {
  const ownedCategory = await findOwnedCategoryById({
    categoryId,
    userId,
  });

  if (!ownedCategory || !ownedCategory.isActive) {
    throw notFound("Category was not found.");
  }

  const nextName = payload.name ? normalizeName(payload.name) : ownedCategory.name;

  if (nextName !== ownedCategory.name) {
    const nameConflict = await findNameConflict({
      userId,
      type: ownedCategory.type,
      normalizedName: nextName,
      excludeId: categoryId,
    });

    if (nameConflict) {
      throw conflict("Category name already exists for this type.", [
        {
          field: "name",
          message: "Please choose another category name.",
        },
      ]);
    }
  }

  await updateOwnedCategory({
    categoryId,
    userId,
    data: {
      name: payload.name ? nextName : undefined,
      icon: payload.icon === undefined ? undefined : payload.icon,
      color: payload.color === undefined ? undefined : payload.color,
      sortOrder: payload.sortOrder,
    },
  });

  const updatedCategory = await findOwnedCategoryById({
    categoryId,
    userId,
  });

  if (!updatedCategory) {
    throw notFound("Category was not found.");
  }

  return toDto(updatedCategory);
}

export async function removeCategory(
  userId: string,
  categoryId: number,
  reassignTo?: number,
): Promise<{ archived: boolean }> {
  const ownedCategory = await findOwnedCategoryById({
    categoryId,
    userId,
  });

  if (!ownedCategory || !ownedCategory.isActive) {
    throw notFound("Category was not found.");
  }

  const transactionCount = await countTransactionsByCategory({
    categoryId,
    userId,
  });

  if (transactionCount > 0) {
    if (!reassignTo) {
      throw validationFailed([
        {
          field: "reassignTo",
          message: "reassignTo is required when the category has transactions.",
        },
      ]);
    }

    if (reassignTo === categoryId) {
      throw validationFailed([
        {
          field: "reassignTo",
          message: "Please choose a different replacement category.",
        },
      ]);
    }

    const target = await findActiveReassignCandidate({
      categoryId: reassignTo,
      userId,
      type: ownedCategory.type,
    });

    if (!target) {
      throw notFound("Replacement category was not found.");
    }

    await reassignTransactionsAndArchiveCategory({
      categoryId,
      reassignTo,
      userId,
    });

    return { archived: true };
  }

  await hardDeleteOwnedCategory({
    categoryId,
    userId,
  });

  return { archived: false };
}
