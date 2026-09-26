import type { RecentActivityResponse } from "./types.js";
import { listRecentActivityByUser } from "./repository.js";

function toDateOnlyString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function getRecentActivity(userId: string): Promise<RecentActivityResponse> {
  const rows = await listRecentActivityByUser(userId);

  return {
    items: rows.map((row) => ({
      id: row.id.toString(),
      transactionId: row.transactionId,
      activityType: row.activityType === "VIEWED" ? "viewed" : "edited",
      categoryName: row.categoryName,
      amount: row.amount.toFixed(2),
      description: row.description,
      txnDate: toDateOnlyString(row.txnDate),
      createdAt: row.createdAt.toISOString(),
    })),
  };
}
