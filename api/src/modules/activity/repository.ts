import { prisma } from "../../lib/prisma.js";

export async function listRecentActivityByUser(userId: string) {
  return prisma.recentActivity.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 20,
  });
}
