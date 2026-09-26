import { Prisma } from "@prisma/client";

import { prisma } from "../../lib/prisma.js";

export type MonthlyCategoryAmountRow = {
  categoryId: number;
  type: "INCOME" | "EXPENSE";
  month: string;
  amount: Prisma.Decimal | string | number;
  txnCount: bigint | number;
};

export async function listForecastCategories(userId: string) {
  return prisma.category.findMany({
    where: {
      isActive: true,
      OR: [{ isDefault: true }, { userId }],
    },
    select: {
      id: true,
      name: true,
      type: true,
    },
    orderBy: [{ type: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
  });
}

export async function listMonthlyCategoryAmounts(params: {
  userId: string;
  from: Date;
  toExclusive: Date;
}): Promise<MonthlyCategoryAmountRow[]> {
  return prisma.$queryRaw<MonthlyCategoryAmountRow[]>`
    SELECT
      t.category_id AS categoryId,
      t.type AS type,
      DATE_FORMAT(t.txn_date, '%Y-%m') AS month,
      COALESCE(SUM(t.amount), 0) AS amount,
      COUNT(*) AS txnCount
    FROM transactions t FORCE INDEX (idx_transactions_user_category_date)
    WHERE t.user_id = ${params.userId}
      AND t.deleted_at IS NULL
      AND t.txn_date >= ${params.from}
      AND t.txn_date < ${params.toExclusive}
    GROUP BY t.category_id, t.type, DATE_FORMAT(t.txn_date, '%Y-%m')
  `;
}

export async function listActiveRecurringRules(userId: string) {
  return prisma.recurringRule.findMany({
    where: {
      userId,
      isActive: true,
    },
    select: {
      categoryId: true,
      type: true,
      amount: true,
      frequency: true,
      intervalCount: true,
      dayOfMonth: true,
      dayOfWeek: true,
      startDate: true,
      endDate: true,
      nextRunDate: true,
    },
  });
}
