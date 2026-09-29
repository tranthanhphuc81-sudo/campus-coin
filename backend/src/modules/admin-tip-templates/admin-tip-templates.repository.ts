/**
 * admin-tip-templates.repository.ts
 * Prisma access for admin-managed savings-tip templates. `locale` is always written as `'en'`
 * (CLAUDE.md golden rule 1) — never accepted as a parameter from the caller.
 * Main exports: adminTipTemplatesRepository, CreateTipTemplateData, UpdateTipTemplateData
 * Spec: docs/spec/05b §5.10 (Bảng 35) · docs/spec/05c §5.13
 */
import type { TipRuleType } from '@campuscoin/shared';
import type { TipTemplateModel } from '../../generated/prisma/models/TipTemplate.js';
import type { AppPrismaClient } from '../../lib/prisma.js';
import { prisma } from '../../lib/prisma.js';

/** Fields accepted by {@link adminTipTemplatesRepository.create}. */
export interface CreateTipTemplateData {
  code: string;
  ruleType: TipRuleType;
  titleTpl: string;
  bodyTpl: string;
  isActive: boolean;
  createdBy: string;
}

/** Partial update accepted by {@link adminTipTemplatesRepository.update}. */
export interface UpdateTipTemplateData {
  titleTpl?: string;
  bodyTpl?: string;
  isActive?: boolean;
}

export const adminTipTemplatesRepository = {
  /** Every tip template, small table so no pagination — ordered for a stable, grouped admin list. */
  findAll(db: AppPrismaClient = prisma): Promise<TipTemplateModel[]> {
    return db.tipTemplate.findMany({ orderBy: [{ ruleType: 'asc' }, { code: 'asc' }] });
  },

  findById(id: number, db: AppPrismaClient = prisma): Promise<TipTemplateModel | null> {
    return db.tipTemplate.findUnique({ where: { id } });
  },

  /** Used for the pre-create uniqueness check (the DB unique constraint on `code` is the backstop). */
  findByCode(code: string, db: AppPrismaClient = prisma): Promise<TipTemplateModel | null> {
    return db.tipTemplate.findUnique({ where: { code } });
  },

  create(data: CreateTipTemplateData, db: AppPrismaClient = prisma): Promise<TipTemplateModel> {
    return db.tipTemplate.create({ data: { ...data, locale: 'en' } });
  },

  update(id: number, data: UpdateTipTemplateData, db: AppPrismaClient = prisma): Promise<TipTemplateModel> {
    return db.tipTemplate.update({ where: { id }, data });
  },

  /** Only ever called once {@link countUserTipReferences} confirms the template is unused. */
  delete(id: number, db: AppPrismaClient = prisma): Promise<TipTemplateModel> {
    return db.tipTemplate.delete({ where: { id } });
  },

  /** Number of generated `UserTip` rows still pointing at this template — blocks hard-delete when > 0. */
  countUserTipReferences(id: number, db: AppPrismaClient = prisma): Promise<number> {
    return db.userTip.count({ where: { templateId: id } });
  },
};
