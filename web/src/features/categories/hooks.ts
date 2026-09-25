import {
  categoriesResponseSchema,
  categorySchema,
  deleteCategoryResponseSchema,
  type Category,
  type CategoryType,
  type CreateCategoryInput,
  type UpdateCategoryInput,
} from "@campus-coin/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import api from "@/lib/api";

export function categoriesQueryKey(type: CategoryType) {
  return ["categories", type] as const;
}

async function fetchCategories(type: CategoryType): Promise<Category[]> {
  const response = await api.get("/categories", {
    params: { type },
  });

  return categoriesResponseSchema.parse(response.data).data;
}

export function useCategories(type: CategoryType) {
  return useQuery({
    queryKey: categoriesQueryKey(type),
    queryFn: () => fetchCategories(type),
  });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateCategoryInput) => {
      const response = await api.post("/categories", payload);
      return categorySchema.parse(response.data);
    },
    onSuccess: (_created, payload) => {
      void queryClient.invalidateQueries({ queryKey: categoriesQueryKey(payload.type) });
    },
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { id: number; type: CategoryType; data: UpdateCategoryInput }) => {
      const response = await api.patch(`/categories/${payload.id}`, payload.data);
      return categorySchema.parse(response.data);
    },
    onSuccess: (_updated, payload) => {
      void queryClient.invalidateQueries({ queryKey: categoriesQueryKey(payload.type) });
    },
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { id: number; type: CategoryType; reassignTo?: number }) => {
      const response = await api.delete(`/categories/${payload.id}`, {
        params: payload.reassignTo ? { reassignTo: payload.reassignTo } : undefined,
      });
      return deleteCategoryResponseSchema.parse(response.data);
    },
    onSuccess: (_deleted, payload) => {
      void queryClient.invalidateQueries({ queryKey: categoriesQueryKey(payload.type) });
    },
  });
}
