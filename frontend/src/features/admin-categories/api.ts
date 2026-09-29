/**
 * api.ts
 * Thin wrappers around `/admin/categories` (system default income/expense categories).
 * Exports: listAdminCategories, createAdminCategory, updateAdminCategory, deleteAdminCategory
 * Spec: docs/spec/05a §5.3 (categories, reused for admin defaults) · docs/spec/05c §5.13
 */
import type { CategoryDto, CreateCategoryInput, TransactionType, UpdateCategoryInput } from '@campuscoin/shared';
import { apiClient } from '../../lib/apiClient/apiClient';

/** `GET /admin/categories?type=` — every default category (active and archived). */
export async function listAdminCategories(type?: TransactionType): Promise<CategoryDto[]> {
  const response = await apiClient.get<CategoryDto[]>('/admin/categories', { params: type ? { type } : {} });
  return response.data;
}

/** `POST /admin/categories` — creates a new system default category. */
export async function createAdminCategory(input: CreateCategoryInput): Promise<CategoryDto> {
  const response = await apiClient.post<CategoryDto>('/admin/categories', input);
  return response.data;
}

/** `PATCH /admin/categories/:id`. */
export async function updateAdminCategory(id: number, input: UpdateCategoryInput): Promise<CategoryDto> {
  const response = await apiClient.patch<CategoryDto>(`/admin/categories/${id}`, input);
  return response.data;
}

/**
 * `DELETE /admin/categories/:id?archive=true` — no `reassignTo` option for admin delete (unlike the
 * student-facing endpoint): a 409 means the category is still in use and must be archived instead.
 * A plain delete returns no body (204); archiving returns the updated `CategoryDto` (200).
 */
export async function deleteAdminCategory(id: number, archive = false): Promise<CategoryDto | null> {
  const response = await apiClient.delete<CategoryDto | undefined>(`/admin/categories/${id}`, { params: archive ? { archive: true } : {} });
  return response.data ?? null;
}
