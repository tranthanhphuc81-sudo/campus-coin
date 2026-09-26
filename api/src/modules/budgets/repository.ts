import { Prisma, type Budget, type Category } from "@prisma/client";

import { prisma } from "../../lib/prisma.js";

export type BudgetWithCategory = Budget & {
  category: Pick<Category, "id" | "name">;
};

export async function listExpenseCategoriesForUser(
  userId: string,
): Promise<Array<Pick<Category, "id" | "name">>> {
  return prisma.category.findMany({
    where: {
      type: "EXPENSE",
      isActive: true,
      OR: [{ isDefault: true }, { userId }],
    },
    select: {
      id: true,
      name: true,
    },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
}

export async function listBudgetsForUserMonth(params: {
  userId: string;
  month: Date;
}): Promise<BudgetWithCategory[]> {
  return prisma.budget.findMany({
    where: {
      userId: params.userId,
      month: params.month,
    },
    include: {
      category: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: [{ categoryId: "asc" }],
  });
}

export async function sumExpenseByCategoryInMonth(params: {
  userId: string;
  monthStart: Date;
  monthEndExclusive: Date;
}) {
  return prisma.transaction.groupBy({
    by: ["categoryId"],
    where: {
      userId: params.userId,
      type: "EXPENSE",
      deletedAt: null,
      txnDate: {
        gte: params.monthStart,
        lt: params.monthEndExclusive,
      },
    },
    _sum: {
      amount: true,
    },
  });
}

export async function ensureOwnedExpenseCategories(params: {
  userId: string;
  categoryIds: number[];
}): Promise<number> {
  return prisma.category.count({
    where: {
      id: {
        in: params.categoryIds,
      },
      type: "EXPENSE",
      isActive: true,
      OR: [{ isDefault: true }, { userId: params.userId }],
    },
  });
}

export async function upsertBudgetsForMonth(params: {
  userId: string;
  month: Date;
  items: Array<{ categoryId: number; limitAmount: Prisma.Decimal; alertThresholdPct: number }>;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    for (const item of params.items) {
      await tx.budget.upsert({
        where: {
          userId_categoryId_month: {
            userId: params.userId,
            categoryId: item.categoryId,
            month: params.month,
          },
        },
        create: {
          userId: params.userId,
          categoryId: item.categoryId,
          month: params.month,
          limitAmount: item.limitAmount,
          alertThresholdPct: item.alertThresholdPct,
        },
        update: {
          limitAmount: item.limitAmount,
          alertThresholdPct: item.alertThresholdPct,
        },
      });
    }
  });
}

export async function listBudgetsByExactMonth(params: {
  userId: string;
  month: Date;
}): Promise<Budget[]> {
  return prisma.budget.findMany({
    where: {
      userId: params.userId,
      month: params.month,
    },
    orderBy: [{ categoryId: "asc" }],
  });
}

export async function findBudgetById(params: {
  id: number;
  userId: string;
}): Promise<Budget | null> {
  return prisma.budget.findFirst({
    where: {
      id: params.id,
      userId: params.userId,
    },
  });
}

export async function deleteBudgetById(params: { id: number; userId: string }): Promise<void> {
  await prisma.budget.deleteMany({
    where: {
      id: params.id,
      userId: params.userId,
    },
  });
}
