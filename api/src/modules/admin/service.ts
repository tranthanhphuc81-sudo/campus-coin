import { createHash } from "node:crypto";

import { CategoryType, Prisma, TipRuleType, UserRole, UserStatus } from "@prisma/client";
import type { Request } from "express";

import { badRequest, conflict, notFound, validationFailed } from "../../lib/problem.js";
import {
  countActiveAdmins,
  countActiveStudents,
  countAiAcceptance,
  countAllTransactions,
  countAllUsers,
  countCompletedInsights,
  countDefaultCategoryReferences,
  countDistinctStudentsByAuditAction,
  createAnnouncement,
  createAuditLog,
  createDefaultCategory,
  createTipTemplate,
  deleteAnnouncement,
  deleteDefaultCategory,
  deleteTipTemplate,
  findAnnouncementById,
  findDefaultCategoryById,
  findTipTemplateById,
  findUserById,
  listActiveAnnouncements,
  listAnnouncements,
  listAuditLogs,
  listDefaultCategories,
  listTipTemplates,
  listUsers,
  queryCategoriesUsage,
  revokeAllRefreshTokens,
  toCategoryType,
  updateAnnouncement,
  updateDefaultCategory,
  updateTipTemplate,
  updateUserStatus,
} from "./repository.js";
import type {
  AdminCategoryUsageResponse,
  AdminOverviewStats,
  AdminUserDetail,
  AdminUsersPage,
  AnnouncementActiveItem,
  AuditLogsPage,
} from "./types.js";

const MIN_K_ANONYMITY = 5;

function parseDateOnly(value: string, field: string): Date {
  const [yearRaw, monthRaw, dayRaw] = value.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw validationFailed([{ field, message: `${field} must be in YYYY-MM-DD format.` }]);
  }

  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (Number.isNaN(parsed.getTime())) {
    throw validationFailed([{ field, message: `${field} must be in YYYY-MM-DD format.` }]);
  }

  return parsed;
}

function addDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function toRole(role: UserRole): "student" | "admin" {
  return role === UserRole.ADMIN ? "admin" : "student";
}

function toStatus(status: UserStatus): "pending" | "active" | "disabled" {
  if (status === UserStatus.PENDING) {
    return "pending";
  }
  if (status === UserStatus.DISABLED) {
    return "disabled";
  }
  return "active";
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) {
    return email;
  }

  const visibleCount = Math.min(2, Math.max(local.length - 3, 1));
  return `${local.slice(0, visibleCount)}***@${domain}`;
}

function renderTemplate(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (full, key: string) => {
    const value = values[key];
    return value ?? full;
  });
}

function defaultPreviewValues(): Record<string, string> {
  return {
    fullName: "Alex Student",
    amount: "1,250.00",
    month: "2026-09",
    category: "Food",
    changePct: "18",
  };
}

function pageMeta(page: number, pageSize: number, totalItems: number) {
  return {
    page,
    pageSize,
    totalItems,
    totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
  };
}

function hashIp(ip: string | null | undefined): string | null {
  if (!ip) {
    return null;
  }

  return createHash("sha256").update(ip).digest("hex");
}

async function writeAdminAuditLog(params: {
  req: Request;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  const actorId = params.req.user?.id;
  if (!actorId) {
    return;
  }

  await createAuditLog({
    actorId,
    actorRole: UserRole.ADMIN,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    ipHash: hashIp(params.req.ip),
    userAgent: params.req.header("user-agent") ?? null,
    metadata: (params.metadata ?? null) as Prisma.InputJsonValue | null,
  });
}

export async function getOverviewStats(params: {
  from?: string;
  to?: string;
}): Promise<AdminOverviewStats> {
  const fromDate = params.from ? parseDateOnly(params.from, "from") : undefined;
  const toDate = params.to ? parseDateOnly(params.to, "to") : undefined;
  const toExclusive = toDate ? addDays(toDate, 1) : undefined;

  if (fromDate && toDate && fromDate > toDate) {
    throw badRequest("from must be before or equal to to.");
  }

  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayEnd = addDays(dayStart, 1);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const [totalUsers, activeStudents, totalTransactions, insights, aiAcceptance, dau, mau] =
    await Promise.all([
      countAllUsers(),
      countActiveStudents(),
      countAllTransactions({ from: fromDate, toExclusive }),
      countCompletedInsights({ from: fromDate, toExclusive }),
      countAiAcceptance({ from: fromDate, toExclusive }),
      countDistinctStudentsByAuditAction("auth.login.success", dayStart, dayEnd),
      countDistinctStudentsByAuditAction("auth.login.success", monthStart, nextMonthStart),
    ]);

  const denominator = aiAcceptance.accepted + aiAcceptance.overridden;
  const aiAcceptanceRate =
    denominator > 0 ? Number(((aiAcceptance.accepted / denominator) * 100).toFixed(2)) : 0;

  const canShowKAnonymous = activeStudents >= MIN_K_ANONYMITY;

  return {
    totalUsers,
    activeStudents,
    dau: canShowKAnonymous ? dau : null,
    mau: canShowKAnonymous ? mau : null,
    dauReason: canShowKAnonymous ? null : "insufficient_data",
    mauReason: canShowKAnonymous ? null : "insufficient_data",
    totalTransactions,
    aiAcceptanceRate,
    completedInsights: insights.completed,
    insightGenerators: {
      llm: insights.llm,
      template: insights.template,
    },
  };
}

export async function getCategoriesUsage(): Promise<AdminCategoryUsageResponse> {
  const usage = await queryCategoriesUsage(20);

  let otherUsage = 0;

  const data = usage
    .filter((item) => {
      if (item.distinctUserCount < MIN_K_ANONYMITY) {
        otherUsage += item.usageCount;
        return false;
      }
      return true;
    })
    .map((item) => ({
      categoryId: item.categoryId,
      name: item.name,
      usageCount: item.usageCount,
      distinctUserCount: item.distinctUserCount,
    }));

  return {
    data,
    other: otherUsage > 0 ? { usageCount: otherUsage } : null,
  };
}

export async function getUsers(params: {
  q?: string;
  page: number;
  pageSize: number;
}): Promise<AdminUsersPage> {
  const result = await listUsers(params);

  return {
    data: result.rows.map((row) => ({
      id: row.id,
      fullName: row.fullName,
      email: maskEmail(row.email),
      role: toRole(row.role),
      status: toStatus(row.status),
      emailVerifiedAt: toIso(row.emailVerifiedAt),
      createdAt: row.createdAt.toISOString(),
      lastLoginAt: toIso(row.lastLoginAt),
      aiOptIn: row.aiOptIn,
      transactionCount: row._count.transactions,
    })),
    pagination: pageMeta(params.page, params.pageSize, result.totalItems),
  };
}

export async function getUserDetail(userId: string): Promise<AdminUserDetail> {
  const row = await findUserById(userId);
  if (!row) {
    throw notFound("User was not found.");
  }

  return {
    id: row.id,
    fullName: row.fullName,
    email: maskEmail(row.email),
    role: toRole(row.role),
    status: toStatus(row.status),
    emailVerifiedAt: toIso(row.emailVerifiedAt),
    createdAt: row.createdAt.toISOString(),
    lastLoginAt: toIso(row.lastLoginAt),
    aiOptIn: row.aiOptIn,
    transactionCount: row._count.transactions,
  };
}

export async function disableUser(params: {
  actorId: string;
  targetUserId: string;
  req: Request;
}): Promise<void> {
  const target = await findUserById(params.targetUserId);
  if (!target) {
    throw notFound("User was not found.");
  }

  if (params.actorId === params.targetUserId) {
    throw validationFailed([{ field: "id", message: "You cannot disable your own account." }]);
  }

  if (target.role === UserRole.ADMIN) {
    const activeAdminCount = await countActiveAdmins();
    if (target.status === UserStatus.ACTIVE && activeAdminCount <= 1) {
      throw conflict("You cannot disable the last active admin account.");
    }
  }

  await updateUserStatus(params.targetUserId, UserStatus.DISABLED);
  await revokeAllRefreshTokens(params.targetUserId);

  await writeAdminAuditLog({
    req: params.req,
    action: "admin.user.disable",
    entityType: "user",
    entityId: params.targetUserId,
    metadata: {
      targetUserId: params.targetUserId,
    },
  });
}

export async function enableUser(params: { targetUserId: string; req: Request }): Promise<void> {
  const target = await findUserById(params.targetUserId);
  if (!target) {
    throw notFound("User was not found.");
  }

  await updateUserStatus(params.targetUserId, UserStatus.ACTIVE);

  await writeAdminAuditLog({
    req: params.req,
    action: "admin.user.enable",
    entityType: "user",
    entityId: params.targetUserId,
    metadata: {
      targetUserId: params.targetUserId,
    },
  });
}

export async function sendResetLinkByAdmin(params: {
  targetUserId: string;
  req: Request;
}): Promise<{ message: string }> {
  const target = await findUserById(params.targetUserId);
  if (!target) {
    throw notFound("User was not found.");
  }

  await writeAdminAuditLog({
    req: params.req,
    action: "admin.user.send_reset_link",
    entityType: "user",
    entityId: params.targetUserId,
    metadata: {
      targetUserId: params.targetUserId,
    },
  });

  return {
    message: "Password reset instructions have been queued for delivery.",
  };
}

function mapCategoryType(type: CategoryType): "income" | "expense" {
  return type === CategoryType.INCOME ? "income" : "expense";
}

export async function listDefaultCategoryItems() {
  const rows = await listDefaultCategories();
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    type: mapCategoryType(row.type),
    icon: row.icon,
    color: row.color,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
  }));
}

export async function createDefaultCategoryItem(params: {
  req: Request;
  input: {
    name: string;
    type: "income" | "expense";
    icon?: string | null;
    color?: string | null;
    isActive?: boolean;
    sortOrder: number;
  };
}) {
  const created = await createDefaultCategory({
    name: params.input.name,
    type: toCategoryType(params.input.type),
    icon: params.input.icon ?? null,
    color: params.input.color ?? null,
    isActive: params.input.isActive ?? true,
    sortOrder: params.input.sortOrder,
  });

  await writeAdminAuditLog({
    req: params.req,
    action: "admin.category.create",
    entityType: "category",
    entityId: String(created.id),
    metadata: {
      id: created.id,
      name: created.name,
      type: mapCategoryType(created.type),
    },
  });

  return {
    id: created.id,
    name: created.name,
    type: mapCategoryType(created.type),
    icon: created.icon,
    color: created.color,
    isActive: created.isActive,
    sortOrder: created.sortOrder,
  };
}

export async function updateDefaultCategoryItem(params: {
  req: Request;
  categoryId: number;
  input: {
    name?: string;
    type?: "income" | "expense";
    icon?: string | null;
    color?: string | null;
    isActive?: boolean;
    sortOrder?: number;
  };
}) {
  const existing = await findDefaultCategoryById(params.categoryId);
  if (!existing) {
    throw notFound("Category was not found.");
  }

  const updated = await updateDefaultCategory(params.categoryId, {
    ...(params.input.name !== undefined ? { name: params.input.name } : {}),
    ...(params.input.type !== undefined ? { type: toCategoryType(params.input.type) } : {}),
    ...(params.input.icon !== undefined ? { icon: params.input.icon } : {}),
    ...(params.input.color !== undefined ? { color: params.input.color } : {}),
    ...(params.input.isActive !== undefined ? { isActive: params.input.isActive } : {}),
    ...(params.input.sortOrder !== undefined ? { sortOrder: params.input.sortOrder } : {}),
  });

  const metadata = {
    before: {
      name: existing.name,
      type: mapCategoryType(existing.type),
      isActive: existing.isActive,
      sortOrder: existing.sortOrder,
    },
    after: {
      name: updated.name,
      type: mapCategoryType(updated.type),
      isActive: updated.isActive,
      sortOrder: updated.sortOrder,
    },
  };

  await writeAdminAuditLog({
    req: params.req,
    action: updated.isActive ? "admin.category.update" : "admin.category.hide",
    entityType: "category",
    entityId: String(updated.id),
    metadata,
  });

  return {
    id: updated.id,
    name: updated.name,
    type: mapCategoryType(updated.type),
    icon: updated.icon,
    color: updated.color,
    isActive: updated.isActive,
    sortOrder: updated.sortOrder,
  };
}

export async function deleteDefaultCategoryItem(params: {
  req: Request;
  categoryId: number;
}): Promise<void> {
  const existing = await findDefaultCategoryById(params.categoryId);
  if (!existing) {
    throw notFound("Category was not found.");
  }

  const references = await countDefaultCategoryReferences(params.categoryId);
  if (references > 0) {
    throw conflict(
      "This category is referenced by existing records. Disable it instead of deleting.",
    );
  }

  await deleteDefaultCategory(params.categoryId);

  await writeAdminAuditLog({
    req: params.req,
    action: "admin.category.delete",
    entityType: "category",
    entityId: String(params.categoryId),
    metadata: {
      name: existing.name,
      type: mapCategoryType(existing.type),
    },
  });
}

export async function listTipTemplateItems() {
  return listTipTemplates();
}

export async function createTipTemplateItem(params: {
  req: Request;
  actorId: string;
  input: {
    code: string;
    ruleType: TipRuleType;
    titleTpl: string;
    bodyTpl: string;
    locale: string;
    isActive: boolean;
  };
}) {
  const created = await createTipTemplate({
    ...params.input,
    createdBy: params.actorId,
  });

  await writeAdminAuditLog({
    req: params.req,
    action: "admin.tip_template.create",
    entityType: "tip_template",
    entityId: String(created.id),
    metadata: {
      code: created.code,
      ruleType: created.ruleType,
    },
  });

  return created;
}

export async function updateTipTemplateItem(params: {
  req: Request;
  id: number;
  input: Partial<{
    code: string;
    ruleType: TipRuleType;
    titleTpl: string;
    bodyTpl: string;
    locale: string;
    isActive: boolean;
  }>;
}) {
  const existing = await findTipTemplateById(params.id);
  if (!existing) {
    throw notFound("Tip template was not found.");
  }

  const updated = await updateTipTemplate(params.id, {
    ...(params.input.code !== undefined ? { code: params.input.code } : {}),
    ...(params.input.ruleType !== undefined ? { ruleType: params.input.ruleType } : {}),
    ...(params.input.titleTpl !== undefined ? { titleTpl: params.input.titleTpl } : {}),
    ...(params.input.bodyTpl !== undefined ? { bodyTpl: params.input.bodyTpl } : {}),
    ...(params.input.locale !== undefined ? { locale: params.input.locale } : {}),
    ...(params.input.isActive !== undefined ? { isActive: params.input.isActive } : {}),
  });

  await writeAdminAuditLog({
    req: params.req,
    action: "admin.tip_template.update",
    entityType: "tip_template",
    entityId: String(updated.id),
    metadata: {
      before: {
        code: existing.code,
        ruleType: existing.ruleType,
      },
      after: {
        code: updated.code,
        ruleType: updated.ruleType,
      },
    },
  });

  return updated;
}

export async function deleteTipTemplateItem(params: { req: Request; id: number }): Promise<void> {
  const existing = await findTipTemplateById(params.id);
  if (!existing) {
    throw notFound("Tip template was not found.");
  }

  await deleteTipTemplate(params.id);

  await writeAdminAuditLog({
    req: params.req,
    action: "admin.tip_template.delete",
    entityType: "tip_template",
    entityId: String(params.id),
    metadata: {
      code: existing.code,
    },
  });
}

export function previewTipTemplate(input: { titleTpl: string; bodyTpl: string }) {
  const sample = defaultPreviewValues();
  return {
    title: renderTemplate(input.titleTpl, sample),
    body: renderTemplate(input.bodyTpl, sample),
    sampleValues: sample,
  };
}

function toAnnouncementLevel(level: "info" | "warning"): "INFO" | "WARNING" {
  return level === "warning" ? "WARNING" : "INFO";
}

function mapAnnouncementLevel(level: "INFO" | "WARNING"): "info" | "warning" {
  return level === "WARNING" ? "warning" : "info";
}

export async function listAnnouncementItems() {
  const rows = await listAnnouncements();
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    level: mapAnnouncementLevel(row.level),
    startsAt: row.startsAt.toISOString().slice(0, 10),
    endsAt: row.endsAt ? row.endsAt.toISOString().slice(0, 10) : null,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function createAnnouncementItem(params: {
  req: Request;
  actorId: string;
  input: {
    title: string;
    body: string;
    level: "info" | "warning";
    startsAt: string;
    endsAt?: string | null;
    isActive: boolean;
  };
}) {
  const startsAt = parseDateOnly(params.input.startsAt, "startsAt");
  const endsAt = params.input.endsAt ? parseDateOnly(params.input.endsAt, "endsAt") : null;

  if (endsAt && endsAt < startsAt) {
    throw validationFailed([{ field: "endsAt", message: "endsAt must be on or after startsAt." }]);
  }

  const created = await createAnnouncement({
    title: params.input.title,
    body: params.input.body,
    level: toAnnouncementLevel(params.input.level),
    startsAt,
    endsAt,
    isActive: params.input.isActive,
    createdBy: params.actorId,
  });

  await writeAdminAuditLog({
    req: params.req,
    action: "admin.announcement.create",
    entityType: "announcement",
    entityId: String(created.id),
    metadata: {
      title: created.title,
      level: created.level,
    },
  });

  return {
    id: created.id,
    title: created.title,
    body: created.body,
    level: mapAnnouncementLevel(created.level),
    startsAt: created.startsAt.toISOString().slice(0, 10),
    endsAt: created.endsAt ? created.endsAt.toISOString().slice(0, 10) : null,
    isActive: created.isActive,
    createdAt: created.createdAt.toISOString(),
    updatedAt: created.updatedAt.toISOString(),
  };
}

export async function updateAnnouncementItem(params: {
  req: Request;
  id: number;
  input: Partial<{
    title: string;
    body: string;
    level: "info" | "warning";
    startsAt: string;
    endsAt: string | null;
    isActive: boolean;
  }>;
}) {
  const existing = await findAnnouncementById(params.id);
  if (!existing) {
    throw notFound("Announcement was not found.");
  }

  const startsAt = params.input.startsAt
    ? parseDateOnly(params.input.startsAt, "startsAt")
    : undefined;
  const endsAt =
    params.input.endsAt === undefined
      ? undefined
      : params.input.endsAt === null
        ? null
        : parseDateOnly(params.input.endsAt, "endsAt");

  const effectiveStart = startsAt ?? existing.startsAt;
  const effectiveEnd = endsAt === undefined ? existing.endsAt : endsAt;

  if (effectiveEnd && effectiveEnd < effectiveStart) {
    throw validationFailed([{ field: "endsAt", message: "endsAt must be on or after startsAt." }]);
  }

  const updated = await updateAnnouncement(params.id, {
    ...(params.input.title !== undefined ? { title: params.input.title } : {}),
    ...(params.input.body !== undefined ? { body: params.input.body } : {}),
    ...(params.input.level !== undefined ? { level: toAnnouncementLevel(params.input.level) } : {}),
    ...(startsAt !== undefined ? { startsAt } : {}),
    ...(endsAt !== undefined ? { endsAt } : {}),
    ...(params.input.isActive !== undefined ? { isActive: params.input.isActive } : {}),
  });

  await writeAdminAuditLog({
    req: params.req,
    action: "admin.announcement.update",
    entityType: "announcement",
    entityId: String(updated.id),
    metadata: {
      before: {
        title: existing.title,
        level: existing.level,
        isActive: existing.isActive,
      },
      after: {
        title: updated.title,
        level: updated.level,
        isActive: updated.isActive,
      },
    },
  });

  return {
    id: updated.id,
    title: updated.title,
    body: updated.body,
    level: mapAnnouncementLevel(updated.level),
    startsAt: updated.startsAt.toISOString().slice(0, 10),
    endsAt: updated.endsAt ? updated.endsAt.toISOString().slice(0, 10) : null,
    isActive: updated.isActive,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  };
}

export async function deleteAnnouncementItem(params: { req: Request; id: number }): Promise<void> {
  const existing = await findAnnouncementById(params.id);
  if (!existing) {
    throw notFound("Announcement was not found.");
  }

  await deleteAnnouncement(params.id);

  await writeAdminAuditLog({
    req: params.req,
    action: "admin.announcement.delete",
    entityType: "announcement",
    entityId: String(params.id),
    metadata: {
      title: existing.title,
    },
  });
}

export function previewAnnouncement(input: { title: string; body: string }) {
  const sample = defaultPreviewValues();
  return {
    title: renderTemplate(input.title, sample),
    body: renderTemplate(input.body, sample),
    sampleValues: sample,
  };
}

export async function getAuditLogs(params: {
  from?: string;
  to?: string;
  action?: string;
  actorId?: string;
  page: number;
  pageSize: number;
}): Promise<AuditLogsPage> {
  const fromDate = params.from ? parseDateOnly(params.from, "from") : undefined;
  const toDate = params.to ? parseDateOnly(params.to, "to") : undefined;
  const toExclusive = toDate ? addDays(toDate, 1) : undefined;

  const result = await listAuditLogs({
    from: fromDate,
    toExclusive,
    action: params.action,
    actorId: params.actorId,
    page: params.page,
    pageSize: params.pageSize,
  });

  return {
    data: result.rows.map((row) => ({
      id: String(row.id),
      actorId: row.actorId,
      actorRole: toRole(row.actorRole),
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      metadata: (row.metadata as Record<string, unknown> | null) ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
    pagination: pageMeta(params.page, params.pageSize, result.totalItems),
  };
}

export async function getActiveAnnouncements(): Promise<AnnouncementActiveItem[]> {
  const rows = await listActiveAnnouncements(new Date());
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    level: mapAnnouncementLevel(row.level),
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt ? row.endsAt.toISOString() : null,
  }));
}
