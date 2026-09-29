/**
 * hooks.ts
 * TanStack Query hooks for `/admin/categories`: list (cached per type filter) + create/update/delete
 * mutations, all invalidating the list on success. Window-focus refetch is disabled (no polling in
 * the admin portal — see AdminLayout's idle-logout note).
 * Exports: adminCategoriesQueryKey, useAdminCategoriesQuery, useCreateAdminCategoryMutation,
 *   useUpdateAdminCategoryMutation, useDeleteAdminCategoryMutation
 * Spec: docs/spec/05a §5.3 · docs/spec/05c §5.13
 */
import type { CategoryDto, CreateCategoryInput, TransactionType, UpdateCategoryInput } from '@campuscoin/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiError } from '../../lib/apiClient/apiError';
import { createAdminCategory, deleteAdminCategory, listAdminCategories, updateAdminCategory } from './api';

/** Query key for a `/admin/categories` list, scoped by its `type` filter. */
export function adminCategoriesQueryKey(type?: TransactionType) {
  return ['admin', 'categories', 'list', type ?? 'all'] as const;
}

/** Reads every default category (optionally filtered by `type`), active and archived. */
export function useAdminCategoriesQuery(type?: TransactionType) {
  return useQuery<CategoryDto[]>({
    queryKey: adminCategoriesQueryKey(type),
    queryFn: () => listAdminCategories(type),
    refetchOnWindowFocus: false,
  });
}

function invalidateAdminCategories(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: ['admin', 'categories'] });
}

/** Creates a new system default category. */
export function useCreateAdminCategoryMutation() {
  const queryClient = useQueryClient();
  return useMutation<CategoryDto, ApiError, CreateCategoryInput>({
    mutationFn: (input: CreateCategoryInput) => createAdminCategory(input),
    onSuccess: () => invalidateAdminCategories(queryClient),
  });
}

/** Updates a default category (rename, recolor, active/archived, reorder). */
export function useUpdateAdminCategoryMutation() {
  const queryClient = useQueryClient();
  return useMutation<CategoryDto, ApiError, { id: number; input: UpdateCategoryInput }>({
    mutationFn: ({ id, input }: { id: number; input: UpdateCategoryInput }) => updateAdminCategory(id, input),
    onSuccess: () => invalidateAdminCategories(queryClient),
  });
}

/** Deletes (or archives) a default category. */
export function useDeleteAdminCategoryMutation() {
  const queryClient = useQueryClient();
  return useMutation<CategoryDto | null, ApiError, { id: number; archive?: boolean }>({
    mutationFn: ({ id, archive }: { id: number; archive?: boolean }) => deleteAdminCategory(id, archive),
    onSuccess: () => invalidateAdminCategories(queryClient),
  });
}
