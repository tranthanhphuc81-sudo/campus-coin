import {
  createTransactionInputSchema,
  deleteTransactionResponseSchema,
  transactionSchema,
  transactionsResponseSchema,
  updateTransactionInputSchema,
  type CreateTransactionInput,
  type Transaction,
  type TransactionType,
  type UpdateTransactionInput,
} from "@campus-coin/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import api from "@/lib/api";

export type TransactionsFilters = {
  month?: string;
  type?: TransactionType;
  categoryId?: number;
  q?: string;
};

export function transactionsQueryKey(filters: TransactionsFilters) {
  return ["transactions", filters] as const;
}

async function fetchTransactions(filters: TransactionsFilters): Promise<Transaction[]> {
  const response = await api.get("/transactions", {
    params: {
      month: filters.month,
      type: filters.type,
      categoryId: filters.categoryId,
      q: filters.q,
    },
  });

  return transactionsResponseSchema.parse(response.data).data;
}

export function useTransactions(filters: TransactionsFilters) {
  return useQuery({
    queryKey: transactionsQueryKey(filters),
    queryFn: () => fetchTransactions(filters),
  });
}

export function useCreateTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateTransactionInput) => {
      const parsedPayload = createTransactionInputSchema.parse(payload);
      const response = await api.post("/transactions", parsedPayload);
      return transactionSchema.parse(response.data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}

export function useUpdateTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { id: string; data: UpdateTransactionInput }) => {
      const parsedPayload = updateTransactionInputSchema.parse(payload.data);
      const response = await api.patch(`/transactions/${payload.id}`, parsedPayload);
      return transactionSchema.parse(response.data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}

export function useDeleteTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { id: string }) => {
      const response = await api.delete(`/transactions/${payload.id}`);
      return deleteTransactionResponseSchema.parse(response.data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}
