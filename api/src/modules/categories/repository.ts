import { CategoryType, Prisma } from "@prisma/client";

import { prisma } from "../../lib/prisma.js";

export function toCategoryType(type: "income" | "expense"): CategoryType {
  return type === "income" ? CategoryType.INCOME : CategoryType.EXPENSE;
}

export async function listActiveCategoriesForUser(params: { userId: string; type: CategoryType }) {
  return prisma.category.findMany({
    where: {
      type: params.type,
      isActive: true,
      OR: [{ isDefault: true }, { userId: params.userId }],
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function countPersonalCategoriesByType(params: {
  userId: string;
  type: CategoryType;
}) {
  return prisma.category.count({
    where: {
      userId: params.userId,
      type: params.type,
      isDefault: false,
      isActive: true,
    },
  });
}

export async function findNameConflict(params: {
  userId: string;
  type: CategoryType;
  normalizedName: string;
  excludeId?: number;
}) {
  return prisma.category.findFirst({
    where: {
      type: params.type,
      id: params.excludeId ? { not: params.excludeId } : undefined,
      OR: [{ isDefault: true }, { userId: params.userId }],
      name: {
        equals: params.normalizedName,
      },
    },
  });
}

export async function createPersonalCategory(params: {
  userId: string;
  name: string;
  type: CategoryType;
  icon?: string;
  color?: string;
  sortOrder?: number;
}) {
  return prisma.category.create({
    data: {
      userId: params.userId,
      isDefault: false,
      isActive: true,
      name: params.name,
      type: params.type,
      icon: params.icon,
      color: params.color,
      sortOrder: params.sortOrder ?? 0,
    },
  });
}

export async function findOwnedCategoryById(params: { categoryId: number; userId: string }) {
  return prisma.category.findFirst({
    where: {
      id: params.categoryId,
      userId: params.userId,
      isDefault: false,
    },
  });
}

export async function updateOwnedCategory(params: {
  categoryId: number;
  userId: string;
  data: Prisma.CategoryUpdateInput;
}) {
  return prisma.category.updateMany({
    where: {
      id: params.categoryId,
      userId: params.userId,
      isDefault: false,
    },
    data: params.data,
  });
}

export async function countTransactionsByCategory(params: { categoryId: number; userId: string }) {
  return prisma.transaction.count({
    where: {
      categoryId: params.categoryId,
      userId: params.userId,
    },
  });
}

export async function findActiveReassignCandidate(params: {
  categoryId: number;
  userId: string;
  type: CategoryType;
}) {
  return prisma.category.findFirst({
    where: {
      id: params.categoryId,
      type: params.type,
      isActive: true,
      OR: [{ isDefault: true }, { userId: params.userId }],
    },
  });
}

export async function reassignTransactionsAndArchiveCategory(params: {
  categoryId: number;
  reassignTo: number;
  userId: string;
}) {
  await prisma.$transaction(async (tx) => {
    await tx.transaction.updateMany({
      where: {
        userId: params.userId,
        categoryId: params.categoryId,
      },
      data: {
        categoryId: params.reassignTo,
      },
    });

    await tx.category.update({
      where: {
        id: params.categoryId,
      },
      data: {
        isActive: false,
      },
    });
  });
}

export async function hardDeleteOwnedCategory(params: { categoryId: number; userId: string }) {
  await prisma.category.deleteMany({
    where: {
      id: params.categoryId,
      userId: params.userId,
      isDefault: false,
    },
  });
}
