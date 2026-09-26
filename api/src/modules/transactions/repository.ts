import type { CategoryType, Prisma, Transaction, TransactionType } from "@prisma/client";

import { prisma } from "../../lib/prisma.js";

export async function listOwnedTransactions(params: {
  userId: string;
  type?: TransactionType;
  categoryId?: number;
  q?: string;
  dateRange?: { gte: Date; lt: Date };
}): Promise<Array<Transaction & { category: { name: string } }>> {
  return prisma.transaction.findMany({
    where: {
      userId: params.userId,
      deletedAt: null,
      type: params.type,
      categoryId: params.categoryId,
      description: params.q
        ? {
            contains: params.q,
          }
        : undefined,
      txnDate: params.dateRange,
    },
    include: {
      category: {
        select: {
          name: true,
        },
      },
    },
    orderBy: [{ txnDate: "desc" }, { createdAt: "desc" }],
  });
}

export async function findOwnedActiveTransactionById(params: {
  id: string;
  userId: string;
}): Promise<(Transaction & { category: { name: string } }) | null> {
  return prisma.transaction.findFirst({
    where: {
      id: params.id,
      userId: params.userId,
      deletedAt: null,
    },
    include: {
      category: {
        select: {
          name: true,
        },
      },
    },
  });
}

export async function findCategoryForUserAndType(params: {
  userId: string;
  categoryId: number;
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

export async function createTransaction(data: Prisma.TransactionCreateInput): Promise<Transaction> {
  return prisma.transaction.create({ data });
}

export async function updateOwnedTransaction(params: {
  id: string;
  userId: string;
  data: Prisma.TransactionUpdateInput;
}): Promise<void> {
  await prisma.transaction.updateMany({
    where: {
      id: params.id,
      userId: params.userId,
      deletedAt: null,
    },
    data: params.data,
  });
}

export async function softDeleteOwnedTransaction(params: {
  id: string;
  userId: string;
}): Promise<void> {
  await prisma.transaction.updateMany({
    where: {
      id: params.id,
      userId: params.userId,
      deletedAt: null,
    },
    data: {
      deletedAt: new Date(),
    },
  });
}

export async function updateOwnedTransactionFlags(params: {
  id: string;
  userId: string;
  data: Prisma.TransactionUpdateInput;
}): Promise<void> {
  await prisma.transaction.updateMany({
    where: {
      id: params.id,
      userId: params.userId,
      deletedAt: null,
    },
    data: params.data,
  });
}
