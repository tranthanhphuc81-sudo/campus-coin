/**
 * hooks.ts
 * TanStack Query hooks for `/categories`: list (cached per query) + create/update/delete
 * mutations, all invalidating the list on success.
 * Exports: categoriesQueryKey, useCategoriesQuery, useCreateCategoryMutation,
 *   useUpdateCategoryMutation, useDeleteCategoryMutation
 * Spec: docs/spec/05a §5.3 (categories)
 */
import type { CategoryDto, CreateCategoryInput, DeleteCategoryQueryInput, ListCategoriesQueryInput, UpdateCategoryInput } from '@campuscoin/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiError } from '../../lib/apiClient/apiError';
import { createCategory, deleteCategory, listCategories, updateCategory } from './api';

/** Query key for a `/categories` list, scoped by its filter params. */
export function categoriesQueryKey(query: Partial<ListCategoriesQueryInput> = {}) {
  return ['categories', 'list', query] as const;
}

/** Reads `/categories` for the given filters (type, includeInactive). */
export function useCategoriesQuery(query: Partial<ListCategoriesQueryInput> = {}) {
  return useQuery<CategoryDto[]>({
    queryKey: categoriesQueryKey(query),
    queryFn: () => listCategories(query),
  });
}

/** Invalidates every cached `/categories` list, regardless of filter params. */
function invalidateCategories(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: ['categories'] });
}

/** Creates a personal category; invalidates every cached categories list on success. */
export function useCreateCategoryMutation() {
  const queryClient = useQueryClient();
  return useMutation<CategoryDto, ApiError, CreateCategoryInput>({
    mutationFn: (input: CreateCategoryInput) => createCategory(input),
    onSuccess: () => invalidateCategories(queryClient),
  });
}

/** Updates a personal category (rename, recolor, archive/unarchive, reorder). */
export function useUpdateCategoryMutation() {
  const queryClient = useQueryClient();
  return useMutation<CategoryDto, ApiError, { id: number; input: UpdateCategoryInput }>({
    mutationFn: ({ id, input }: { id: number; input: UpdateCategoryInput }) => updateCategory(id, input),
    onSuccess: () => invalidateCategories(queryClient),
  });
}

/** Deletes (or archives/reassigns-then-deletes) a personal category. */
export function useDeleteCategoryMutation() {
  const queryClient = useQueryClient();
  return useMutation<CategoryDto | null, ApiError, { id: number; query?: Partial<DeleteCategoryQueryInput> }>({
    mutationFn: ({ id, query }: { id: number; query?: Partial<DeleteCategoryQueryInput> }) => deleteCategory(id, query),
    onSuccess: () => {
      invalidateCategories(queryClient);
      // A category may be deleted from the picker used elsewhere (quick-add/edit form).
      void queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
}
