/**
 * api.ts
 * Thin wrappers around `/admin/tip-templates` (savings-tip template CRUD + preview).
 * Exports: listAdminTipTemplates, createAdminTipTemplate, updateAdminTipTemplate,
 *   deleteAdminTipTemplate, previewAdminTipTemplate, TipTemplatePreview
 * Spec: docs/spec/05b §5.10 · docs/spec/05c §5.13
 */
import type { CreateTipTemplateInput, PreviewTipTemplateInput, TipTemplateDto, UpdateTipTemplateInput } from '@campuscoin/shared';
import { apiClient } from '../../lib/apiClient/apiClient';

/** Rendered sample output of `POST /admin/tip-templates/preview`. */
export interface TipTemplatePreview {
  title: string;
  body: string;
}

/** `GET /admin/tip-templates` — every tip template, active and inactive. */
export async function listAdminTipTemplates(): Promise<TipTemplateDto[]> {
  const response = await apiClient.get<TipTemplateDto[]>('/admin/tip-templates');
  return response.data;
}

/** `POST /admin/tip-templates` — 409 on a duplicate `code`. */
export async function createAdminTipTemplate(input: CreateTipTemplateInput): Promise<TipTemplateDto> {
  const response = await apiClient.post<TipTemplateDto>('/admin/tip-templates', input);
  return response.data;
}

/** `PATCH /admin/tip-templates/:id` — no `code`/`ruleType` (immutable after creation). */
export async function updateAdminTipTemplate(id: number, input: UpdateTipTemplateInput): Promise<TipTemplateDto> {
  const response = await apiClient.patch<TipTemplateDto>(`/admin/tip-templates/${id}`, input);
  return response.data;
}

/** `DELETE /admin/tip-templates/:id` — 409 if a `UserTip` still references it (deactivate instead). */
export async function deleteAdminTipTemplate(id: number): Promise<void> {
  await apiClient.delete(`/admin/tip-templates/${id}`);
}

/** `POST /admin/tip-templates/preview` — renders `{titleTpl, bodyTpl}` with fixed sample data. */
export async function previewAdminTipTemplate(input: PreviewTipTemplateInput): Promise<TipTemplatePreview> {
  const response = await apiClient.post<TipTemplatePreview>('/admin/tip-templates/preview', input);
  return response.data;
}
