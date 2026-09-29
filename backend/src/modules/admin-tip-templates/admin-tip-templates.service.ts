/**
 * admin-tip-templates.service.ts
 * Business logic for admin CRUD of savings-tip templates, plus a read-only preview that renders
 * an in-progress edit with fixed sample values before it is saved. Reuses the exact
 * `renderTemplate` engine the real tips pipeline uses (`tips.render.ts`), so a preview never drifts
 * from real rendering behaviour.
 * Main exports: list, create, update, remove, preview
 * Spec: docs/spec/05b §5.10 · docs/spec/05c §5.13
 */
import {
  TIP_TEMPLATE_BODY_MAX_LENGTH,
  TIP_TEMPLATE_TITLE_MAX_LENGTH,
  type CreateTipTemplateInput,
  type PreviewTipTemplateInput,
  type TipTemplateDto,
  type UpdateTipTemplateInput,
} from '@campuscoin/shared';
import { conflict, notFound } from '../../lib/problem.js';
import { renderTemplate } from '../tips/tips.render.js';
import { adminTipTemplatesRepository } from './admin-tip-templates.repository.js';
import { toTipTemplateDto } from './admin-tip-templates.mapper.js';

/** Fixed sample values for `POST /admin/tip-templates/preview` — `percent` has no "%" suffix,
 * matching the convention every real tip rule (`rules/r1.ts`, `r2.ts`, `r6.ts`) already uses. */
const PREVIEW_VARS = { category: 'Food', amount: '25.00', percent: '80' };

/** `GET /admin/tip-templates` — every template (small table, no pagination). */
export async function list(): Promise<TipTemplateDto[]> {
  const rows = await adminTipTemplatesRepository.findAll();
  return rows.map(toTipTemplateDto);
}

/**
 * Creates a tip template. `locale` is always `'en'` (set by the repository, never client input).
 * @throws {AppError} 409 conflict when `code` is already used.
 */
export async function create(input: CreateTipTemplateInput, createdBy: string): Promise<TipTemplateDto> {
  const clash = await adminTipTemplatesRepository.findByCode(input.code);
  if (clash) throw conflict('A tip template with this code already exists.');

  const created = await adminTipTemplatesRepository.create({
    code: input.code,
    ruleType: input.ruleType,
    titleTpl: input.titleTpl,
    bodyTpl: input.bodyTpl,
    isActive: input.isActive,
    createdBy,
  });
  return toTipTemplateDto(created);
}

/**
 * Updates a tip template's `titleTpl`/`bodyTpl`/`isActive`. `code`/`ruleType` are immutable.
 * @throws {AppError} 404 when `id` is not a tip template.
 */
export async function update(id: number, input: UpdateTipTemplateInput): Promise<TipTemplateDto> {
  const current = await adminTipTemplatesRepository.findById(id);
  if (!current) throw notFound('Tip template not found.');

  const updated = await adminTipTemplatesRepository.update(id, {
    ...(input.titleTpl !== undefined ? { titleTpl: input.titleTpl } : {}),
    ...(input.bodyTpl !== undefined ? { bodyTpl: input.bodyTpl } : {}),
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
  });
  return toTipTemplateDto(updated);
}

/**
 * Hard-deletes a tip template.
 * @throws {AppError} 404 when `id` is not a tip template; 409 when a generated `UserTip` still
 *   references it (deactivate via `update(id, { isActive: false })` instead).
 */
export async function remove(id: number): Promise<void> {
  const current = await adminTipTemplatesRepository.findById(id);
  if (!current) throw notFound('Tip template not found.');

  const usage = await adminTipTemplatesRepository.countUserTipReferences(id);
  if (usage > 0) {
    throw conflict('This template is in use. Deactivate it instead (PATCH { isActive: false }).');
  }

  await adminTipTemplatesRepository.delete(id);
}

/** `POST /admin/tip-templates/preview` — renders an in-progress edit with fixed sample values. */
export function preview(input: PreviewTipTemplateInput): { title: string; body: string } {
  return {
    title: renderTemplate(input.titleTpl, PREVIEW_VARS, TIP_TEMPLATE_TITLE_MAX_LENGTH),
    body: renderTemplate(input.bodyTpl, PREVIEW_VARS, TIP_TEMPLATE_BODY_MAX_LENGTH),
  };
}
