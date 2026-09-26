import { TipRuleType } from "@prisma/client";
import { z } from "zod";

const yyyyMmDd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const pagingQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const adminUsersQuerySchema = pagingQuerySchema.extend({
  q: z.string().trim().max(120).optional(),
});

export const adminUserIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const adminDefaultCategoryBodySchema = z.object({
  name: z.string().trim().min(1).max(50),
  type: z.enum(["income", "expense"]),
  icon: z.string().trim().max(40).nullable().optional(),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(999).default(0),
});

export const adminDefaultCategoryUpdateBodySchema = adminDefaultCategoryBodySchema.partial();

export const adminCategoryIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const adminTipTemplateBodySchema = z.object({
  code: z.string().trim().min(2).max(40),
  ruleType: z.nativeEnum(TipRuleType),
  titleTpl: z.string().trim().min(1).max(150),
  bodyTpl: z.string().trim().min(1).max(500),
  locale: z.string().trim().min(2).max(5).default("en"),
  isActive: z.boolean().default(true),
});

export const adminTipTemplateUpdateBodySchema = adminTipTemplateBodySchema.partial();

export const adminTipTemplatePreviewBodySchema = z.object({
  titleTpl: z.string().trim().min(1).max(150),
  bodyTpl: z.string().trim().min(1).max(500),
});

export const adminAnnouncementBodySchema = z.object({
  title: z.string().trim().min(1).max(150),
  body: z.string().trim().min(1).max(1000),
  level: z.enum(["info", "warning"]).default("info"),
  startsAt: yyyyMmDd,
  endsAt: yyyyMmDd.nullable().optional(),
  isActive: z.boolean().default(true),
});

export const adminAnnouncementUpdateBodySchema = adminAnnouncementBodySchema.partial();

export const adminAnnouncementPreviewBodySchema = z.object({
  title: z.string().trim().min(1).max(150),
  body: z.string().trim().min(1).max(1000),
});

export const adminAnnouncementIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const adminAuditLogsQuerySchema = pagingQuerySchema.extend({
  from: yyyyMmDd.optional(),
  to: yyyyMmDd.optional(),
  action: z.string().trim().max(120).optional(),
  actorId: z.string().uuid().optional(),
});
