import { CategoryType, Prisma, TipRuleType, UserRole, UserStatus } from "@prisma/client";

import { prisma } from "../../lib/prisma.js";

type DateRange = {
  from?: Date;
  toExclusive?: Date;
};

export function toCategoryType(type: "income" | "expense"): CategoryType {
  return type === "income" ? CategoryType.INCOME : CategoryType.EXPENSE;
}

export async function countAllUsers(): Promise<number> {
  return prisma.user.count({ where: { deletedAt: null } });
}

export async function countActiveStudents(): Promise<number> {
  return prisma.user.count({
    where: { deletedAt: null, role: UserRole.STUDENT, status: UserStatus.ACTIVE },
  });
}

export async function countAllTransactions(range: DateRange): Promise<number> {
  return prisma.transaction.count({
    where: {
      deletedAt: null,
      ...(range.from || range.toExclusive
        ? {
            createdAt: {
              ...(range.from ? { gte: range.from } : {}),
              ...(range.toExclusive ? { lt: range.toExclusive } : {}),
            },
          }
        : {}),
    },
  });
}

export async function countDistinctStudentsByAuditAction(
  action: string,
  from: Date,
  toExclusive: Date,
): Promise<number> {
  const rows = await prisma.auditLog.findMany({
    where: {
      action,
      actorRole: UserRole.STUDENT,
      createdAt: {
        gte: from,
        lt: toExclusive,
      },
    },
    select: {
      actorId: true,
    },
    distinct: ["actorId"],
  });

  return rows.length;
}

export async function countCompletedInsights(
  range: DateRange,
): Promise<{ completed: number; llm: number; template: number }> {
  const where: Prisma.InsightWhereInput = {
    status: "COMPLETED",
    ...(range.from || range.toExclusive
      ? {
          createdAt: {
            ...(range.from ? { gte: range.from } : {}),
            ...(range.toExclusive ? { lt: range.toExclusive } : {}),
          },
        }
      : {}),
  };

  const [completed, llm, template] = await Promise.all([
    prisma.insight.count({ where }),
    prisma.insight.count({ where: { ...where, generator: "llm" } }),
    prisma.insight.count({ where: { ...where, generator: "template" } }),
  ]);

  return { completed, llm, template };
}

export async function countAiAcceptance(
  range: DateRange,
): Promise<{ accepted: number; overridden: number }> {
  void range;
  return { accepted: 0, overridden: 0 };
}

export async function queryCategoriesUsage(
  limit: number,
): Promise<
  Array<{ categoryId: number; name: string; usageCount: number; distinctUserCount: number }>
> {
  const rows = await prisma.$queryRaw<
    Array<{
      categoryId: number;
      name: string;
      usageCount: bigint | number;
      distinctUserCount: bigint | number;
    }>
  >`
    SELECT
      c.id AS categoryId,
      c.name AS name,
      COUNT(t.id) AS usageCount,
      COUNT(DISTINCT t.user_id) AS distinctUserCount
    FROM categories c
    INNER JOIN transactions t ON t.category_id = c.id
    WHERE c.is_default = true
      AND t.deleted_at IS NULL
    GROUP BY c.id, c.name
    ORDER BY usageCount DESC
    LIMIT ${limit}
  `;

  return rows.map((row) => ({
    categoryId: row.categoryId,
    name: row.name,
    usageCount: Number(row.usageCount),
    distinctUserCount: Number(row.distinctUserCount),
  }));
}

export async function listUsers(params: { q?: string; page: number; pageSize: number }) {
  const where: Prisma.UserWhereInput = {
    deletedAt: null,
    ...(params.q
      ? {
          OR: [{ fullName: { contains: params.q } }, { email: { contains: params.q } }],
        }
      : {}),
  };

  const [totalItems, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        status: true,
        emailVerifiedAt: true,
        createdAt: true,
        lastLoginAt: true,
        aiOptIn: true,
        _count: {
          select: {
            transactions: {
              where: {
                deletedAt: null,
              },
            },
          },
        },
      },
    }),
  ]);

  return {
    totalItems,
    rows,
  };
}

export async function findUserById(userId: string) {
  return prisma.user.findFirst({
    where: {
      id: userId,
      deletedAt: null,
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      status: true,
      emailVerifiedAt: true,
      createdAt: true,
      lastLoginAt: true,
      aiOptIn: true,
      _count: {
        select: {
          transactions: {
            where: {
              deletedAt: null,
            },
          },
        },
      },
    },
  });
}

export async function countActiveAdmins(): Promise<number> {
  return prisma.user.count({
    where: {
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      deletedAt: null,
    },
  });
}

export async function updateUserStatus(userId: string, status: UserStatus): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { status },
  });
}

export async function revokeAllRefreshTokens(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: {
      userId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
}

export async function listDefaultCategories() {
  return prisma.category.findMany({
    where: {
      isDefault: true,
      userId: null,
    },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
}

export async function findDefaultCategoryById(categoryId: number) {
  return prisma.category.findFirst({
    where: {
      id: categoryId,
      isDefault: true,
      userId: null,
    },
  });
}

export async function createDefaultCategory(data: {
  name: string;
  type: CategoryType;
  icon: string | null;
  color: string | null;
  isActive: boolean;
  sortOrder: number;
}) {
  return prisma.category.create({
    data: {
      userId: null,
      isDefault: true,
      ...data,
    },
  });
}

export async function updateDefaultCategory(categoryId: number, data: Prisma.CategoryUpdateInput) {
  return prisma.category.update({
    where: {
      id: categoryId,
    },
    data,
  });
}

export async function countDefaultCategoryReferences(categoryId: number): Promise<number> {
  const [transactions, recurringRules, budgets, importRows, userTips] = await Promise.all([
    prisma.transaction.count({ where: { categoryId } }),
    prisma.recurringRule.count({ where: { categoryId } }),
    prisma.budget.count({ where: { categoryId } }),
    prisma.importRow.count({ where: { categoryId } }),
    prisma.userTip.count({ where: { categoryId } }),
  ]);

  return transactions + recurringRules + budgets + importRows + userTips;
}

export async function deleteDefaultCategory(categoryId: number): Promise<void> {
  await prisma.category.delete({ where: { id: categoryId } });
}

export async function listTipTemplates() {
  return prisma.tipTemplate.findMany({
    orderBy: [{ updatedAt: "desc" }],
  });
}

export async function findTipTemplateById(id: number) {
  return prisma.tipTemplate.findUnique({ where: { id } });
}

export async function createTipTemplate(data: {
  code: string;
  ruleType: TipRuleType;
  titleTpl: string;
  bodyTpl: string;
  locale: string;
  isActive: boolean;
  createdBy: string;
}) {
  return prisma.tipTemplate.create({
    data,
  });
}

export async function updateTipTemplate(id: number, data: Prisma.TipTemplateUpdateInput) {
  return prisma.tipTemplate.update({
    where: { id },
    data,
  });
}

export async function deleteTipTemplate(id: number): Promise<void> {
  await prisma.tipTemplate.delete({ where: { id } });
}

export async function listAnnouncements() {
  return prisma.announcement.findMany({
    orderBy: [{ startsAt: "desc" }, { id: "desc" }],
  });
}

export async function findAnnouncementById(id: number) {
  return prisma.announcement.findUnique({ where: { id } });
}

export async function createAnnouncement(data: {
  title: string;
  body: string;
  level: "INFO" | "WARNING";
  startsAt: Date;
  endsAt: Date | null;
  isActive: boolean;
  createdBy: string;
}) {
  return prisma.announcement.create({ data });
}

export async function updateAnnouncement(id: number, data: Prisma.AnnouncementUpdateInput) {
  return prisma.announcement.update({ where: { id }, data });
}

export async function deleteAnnouncement(id: number): Promise<void> {
  await prisma.announcement.delete({ where: { id } });
}

export async function listActiveAnnouncements(now: Date) {
  return prisma.announcement.findMany({
    where: {
      isActive: true,
      startsAt: {
        lte: now,
      },
      OR: [{ endsAt: null }, { endsAt: { gte: now } }],
    },
    orderBy: [{ startsAt: "desc" }, { id: "desc" }],
  });
}

export async function createAuditLog(data: {
  actorId: string;
  actorRole: UserRole;
  action: string;
  entityType: string;
  entityId: string | null;
  ipHash: string | null;
  userAgent: string | null;
  metadata: Prisma.InputJsonValue | null;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      ...data,
      metadata: data.metadata === null ? Prisma.JsonNull : data.metadata,
    },
  });
}

export async function listAuditLogs(params: {
  from?: Date;
  toExclusive?: Date;
  action?: string;
  actorId?: string;
  page: number;
  pageSize: number;
}) {
  const where: Prisma.AuditLogWhereInput = {
    ...(params.from || params.toExclusive
      ? {
          createdAt: {
            ...(params.from ? { gte: params.from } : {}),
            ...(params.toExclusive ? { lt: params.toExclusive } : {}),
          },
        }
      : {}),
    ...(params.action ? { action: { contains: params.action } } : {}),
    ...(params.actorId ? { actorId: params.actorId } : {}),
  };

  const [totalItems, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
  ]);

  return {
    totalItems,
    rows,
  };
}
