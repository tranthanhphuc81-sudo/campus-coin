/**
 * admin-stats.service.ts
 * Read-only aggregate stats for the admin dashboard (docs/spec/05c Table 24). Every number comes
 * from a Prisma aggregate query, never summed in Node (CLAUDE.md perf convention, matches
 * `dashboard.service.ts`). Operational definitions (not spelled out by the spec table) are
 * documented inline at each metric.
 * Main exports: overview, categoriesUsage
 * Spec: docs/spec/05c §5.13 (Table 24) · docs/spec/07 §7.3.4
 */
import {
  ADMIN_GROWTH_WINDOW_DAYS,
  ADMIN_K_ANONYMITY_MIN,
  CategorySource,
  InsightStatus,
  SYSTEM_OWNER_KEY,
  UserStatus,
  type AdminCategoryUsageDto,
  type AdminStatsOverviewDto,
  type TransactionType,
} from '@campuscoin/shared';
import { prisma } from '../../lib/prisma.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Rounds `value` to `decimals` fraction digits. */
function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** `usersByStatus`, defaulting every status to 0 (a status with 0 users must still be reported). */
function toUsersByStatus(groups: { status: string; _count: number }[]): AdminStatsOverviewDto['usersByStatus'] {
  const result = { pending: 0, active: 0, disabled: 0 };
  for (const g of groups) {
    if (g.status === UserStatus.PENDING) result.pending = g._count;
    else if (g.status === UserStatus.ACTIVE) result.active = g._count;
    else if (g.status === UserStatus.DISABLED) result.disabled = g._count;
  }
  return result;
}

/** `GET /admin/stats/overview`. */
export async function overview(): Promise<AdminStatsOverviewDto> {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - DAY_MS);
  const windowAgo = new Date(now.getTime() - ADMIN_GROWTH_WINDOW_DAYS * DAY_MS);
  const priorWindowAgo = new Date(now.getTime() - 2 * ADMIN_GROWTH_WINDOW_DAYS * DAY_MS);

  const [dau, mau, statusGroups, totalTransactions, newUsers30d, priorUsers, accepted, overridden, insightsGenerated] =
    await Promise.all([
      // DAU: distinct users with a login in the last 24h — the simplest, standard operational
      // definition when there is no separate "session started" event stream to sample from.
      prisma.user.count({ where: { lastLoginAt: { gte: oneDayAgo } } }),
      // MAU: same definition, over the admin growth window (30d).
      prisma.user.count({ where: { lastLoginAt: { gte: windowAgo } } }),
      prisma.user.groupBy({ by: ['status'], _count: true }),
      prisma.transaction.count({ where: { deletedAt: null } }),
      prisma.user.count({ where: { createdAt: { gte: windowAgo } } }),
      prisma.user.count({ where: { createdAt: { gte: priorWindowAgo, lt: windowAgo } } }),
      prisma.transaction.count({ where: { deletedAt: null, categorySource: CategorySource.AI_ACCEPTED } }),
      prisma.transaction.count({ where: { deletedAt: null, categorySource: CategorySource.AI_OVERRIDDEN } }),
      prisma.insight.count({ where: { status: InsightStatus.COMPLETED } }),
    ]);

  // growthPct30d: % change of newUsers30d vs. the same-length PRIOR window; undefined (null) when
  // the prior window had 0 users — a "% change from zero" is not a meaningful number.
  const growthPct30d = priorUsers === 0 ? null : round(((newUsers30d - priorUsers) / priorUsers) * 100, 2);

  // aiAcceptanceRate: share of AI-categorized transactions the user kept vs. overrode. Transactions
  // never touched by AI (categorySource user/rule/import) are excluded — they say nothing about AI
  // quality. null (not 0) when there is no AI-categorized data yet, so the UI can show "n/a".
  const totalAiDecisions = accepted + overridden;
  const aiAcceptanceRate = totalAiDecisions === 0 ? null : round(accepted / totalAiDecisions, 4);

  return {
    dau,
    mau,
    usersByStatus: toUsersByStatus(statusGroups as { status: string; _count: number }[]),
    totalTransactions,
    newUsers30d,
    growthPct30d,
    aiAcceptanceRate,
    insightsGenerated,
  };
}

/**
 * `GET /admin/stats/categories-usage`. k-anonymity (Table 24): a category used by fewer than
 * {@link ADMIN_K_ANONYMITY_MIN} distinct users is omitted entirely, not zeroed/nulled — an admin
 * must never be able to infer a specific student's spending from a near-unique category.
 */
export async function categoriesUsage(): Promise<AdminCategoryUsageDto[]> {
  const categories = await prisma.category.findMany({ where: { ownerKey: SYSTEM_OWNER_KEY } });

  const rows = await Promise.all(
    categories.map(async (category) => {
      const [transactionCount, distinctUsers] = await Promise.all([
        prisma.transaction.count({ where: { categoryId: category.id, deletedAt: null } }),
        prisma.transaction.groupBy({ by: ['userId'], where: { categoryId: category.id, deletedAt: null } }),
      ]);
      return {
        categoryId: category.id,
        categoryName: category.name,
        type: category.type as TransactionType,
        transactionCount,
        userCount: distinctUsers.length,
      };
    }),
  );

  return rows
    .filter((row) => row.userCount >= ADMIN_K_ANONYMITY_MIN)
    .sort((a, b) => b.transactionCount - a.transactionCount);
}
