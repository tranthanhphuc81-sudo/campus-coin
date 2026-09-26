import { Prisma } from "@prisma/client";

import { prisma } from "./prisma.js";

export type RecentActivityInput = {
  userId: string;
  transactionId: string;
  activityType: "VIEWED" | "EDITED";
  categoryName: string;
  amount: Prisma.Decimal;
  txnDate: Date;
  description: string | null;
};

const MAX_RECENT_ACTIVITY = 20;

export async function recordRecentActivity(input: RecentActivityInput): Promise<void> {
  await prisma.recentActivity.create({
    data: {
      userId: input.userId,
      transactionId: input.transactionId,
      activityType: input.activityType,
      categoryName: input.categoryName,
      amount: input.amount,
      txnDate: input.txnDate,
      description: input.description,
    },
  });

  const overflowRows = await prisma.recentActivity.findMany({
    where: { userId: input.userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: MAX_RECENT_ACTIVITY,
    take: 200,
    select: { id: true },
  });

  if (overflowRows.length === 0) {
    return;
  }

  await prisma.recentActivity.deleteMany({
    where: {
      id: {
        in: overflowRows.map((row) => row.id),
      },
    },
  });
}
