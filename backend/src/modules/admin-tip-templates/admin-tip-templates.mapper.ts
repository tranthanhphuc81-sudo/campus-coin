/**
 * admin-tip-templates.mapper.ts
 * Maps a Prisma `TipTemplate` row to the admin-facing {@link TipTemplateDto}.
 * Main exports: toTipTemplateDto
 * Spec: docs/spec/05b §5.10 (Bảng 35)
 */
import type { TipRuleType, TipTemplateDto } from '@campuscoin/shared';
import type { TipTemplateModel } from '../../generated/prisma/models/TipTemplate.js';

/**
 * Converts a Prisma `TipTemplate` row into the admin-facing {@link TipTemplateDto}.
 * @param template - Full row, as read from the DB (never partially selected).
 */
export function toTipTemplateDto(template: TipTemplateModel): TipTemplateDto {
  return {
    id: template.id,
    code: template.code,
    ruleType: template.ruleType as TipRuleType,
    titleTpl: template.titleTpl,
    bodyTpl: template.bodyTpl,
    isActive: template.isActive,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
  };
}
