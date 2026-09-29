/**
 * api.ts
 * Thin wrappers around `/categories` (personal + default income/expense categories).
 * Exports: listCategories, createCategory, updateCategory, deleteCategory
 * Spec: docs/spec/05a §5.3 (categories) · API: docs/spec/07 · Rules: BR-CA-01..05
 */
import type { CategoryDto, CreateCategoryInput, DeleteCategoryQueryInput, ListCategoriesQueryInput, UpdateCategoryInput } from '@campuscoin/shared';
import { apiClient } from '../../lib/apiClient/apiClient';

/** `GET /categories` — active system defaults + the caller's own (optionally including archived). */
export async function listCategories(query: Partial<ListCategoriesQueryInput> = {}): Promise<CategoryDto[]> {
  const response = await apiClient.get<CategoryDto[]>('/categories', { params: query });
  return response.data;
}

/** `POST /categories` — creates a personal category (BR-CA-01, BR-CA-04: max 50 per user). */
export async function createCategory(input: CreateCategoryInput): Promise<CategoryDto> {
  const response = await apiClient.post<CategoryDto>('/categories', input);
  return response.data;
}

/** `PATCH /categories/:id` — updates one of the caller's own personal categories. */
export async function updateCategory(id: number, input: UpdateCategoryInput): Promise<CategoryDto> {
  const response = await apiClient.patch<CategoryDto>(`/categories/${id}`, input);
  return response.data;
}

/**
 * `DELETE /categories/:id` — BR-CA-03: `reassignTo`/`archive` are mutually exclusive.
 * Reassign or plain delete return no body (204); archive returns the updated `CategoryDto` (200).
 */
export async function deleteCategory(id: number, query: Partial<DeleteCategoryQueryInput> = {}): Promise<CategoryDto | null> {
  const response = await apiClient.delete<CategoryDto | undefined>(`/categories/${id}`, { params: query });
  return response.data ?? null;
}
