import type { Prisma, RecurringRule } from "@prisma/client";

import { prisma } from "../../lib/prisma.js";

export async function listRecurringRulesByUser(userId: string): Promise<RecurringRule[]> {
  return prisma.recurringRule.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
}

export async function findRecurringRuleById(params: {
  id: number;
  userId: string;
}): Promise<RecurringRule | null> {
  return prisma.recurringRule.findFirst({
    where: {
      id: params.id,
      userId: params.userId,
    },
  });
}

export async function findCategoryForRule(params: {
  userId: string;
  categoryId: number;
  type: "INCOME" | "EXPENSE";
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

export async function createRecurringRule(data: Prisma.RecurringRuleCreateInput): Promise<RecurringRule> {
  return prisma.recurringRule.create({ data });
}

export async function updateRecurringRule(params: {
  id: number;
  userId: string;
  data: Prisma.RecurringRuleUpdateInput;
}): Promise<void> {
  await prisma.recurringRule.updateMany({
    where: {
      id: params.id,
      userId: params.userId,
    },
    data: params.data,
  });
}
