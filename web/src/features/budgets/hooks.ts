import {
  budgetsResponseSchema,
  copyPreviousBudgetsInputSchema,
  copyPreviousBudgetsResponseSchema,
  upsertBudgetsInputSchema,
  type Budget,
  type CopyPreviousBudgetsInput,
  type UpsertBudgetsInput,
} from "@campus-coin/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import api from "@/lib/api";

export function budgetsQueryKey(month: string) {
  return ["budgets", month] as const;
}

async function fetchBudgets(month: string): Promise<Budget[]> {
  const response = await api.get("/budgets", {
    params: { month },
  });

  return budgetsResponseSchema.parse(response.data).data;
}

export function useBudgets(month: string) {
  return useQuery({
    queryKey: budgetsQueryKey(month),
    queryFn: () => fetchBudgets(month),
  });
}

export function useUpsertBudgets() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: UpsertBudgetsInput) => {
      const parsedPayload = upsertBudgetsInputSchema.parse(payload);
      const response = await api.put("/budgets", parsedPayload);
      return budgetsResponseSchema.parse(response.data).data;
    },
    onSuccess: (_data, payload) => {
      void queryClient.invalidateQueries({ queryKey: budgetsQueryKey(payload.month) });
    },
  });
}

export function useCopyPreviousBudgets() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CopyPreviousBudgetsInput) => {
      const parsedPayload = copyPreviousBudgetsInputSchema.parse(payload);
      const response = await api.post("/budgets/copy-previous", parsedPayload);
      return copyPreviousBudgetsResponseSchema.parse(response.data);
    },
    onSuccess: (result, payload) => {
      void queryClient.invalidateQueries({ queryKey: budgetsQueryKey(payload.month) });
      void queryClient.setQueryData(budgetsQueryKey(payload.month), result.data);
    },
  });
}

export function useDeleteBudget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { id: number; month: string }) => {
      await api.delete(`/budgets/${payload.id}`);
      return payload;
    },
    onSuccess: (_result, payload) => {
      void queryClient.invalidateQueries({ queryKey: budgetsQueryKey(payload.month) });
    },
  });
}
