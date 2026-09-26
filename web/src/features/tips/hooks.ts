import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

import api from "@/lib/api";

const tipItemSchema = z.object({
  id: z.string(),
  ruleType: z.enum([
    "over_budget",
    "above_average",
    "small_frequent",
    "subscriptions",
    "savings_gap",
    "weekend_spike",
    "general",
  ]),
  categoryId: z.number().nullable(),
  title: z.string(),
  body: z.string(),
  impactAmount: z.string(),
  score: z.number(),
  status: z.enum(["active", "pinned"]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const tipsResponseSchema = z.object({
  month: z.string(),
  generatedAt: z.string(),
  tips: z.array(tipItemSchema),
});

const wrappedTipsSchema = z.object({
  data: tipsResponseSchema,
});

export type TipItem = z.infer<typeof tipItemSchema>;
export type TipsResponse = z.infer<typeof tipsResponseSchema>;

export function tipsQueryKey() {
  return ["tips", "list"] as const;
}

export function useTips() {
  return useQuery({
    queryKey: tipsQueryKey(),
    queryFn: async () => {
      const response = await api.get("/tips");
      return wrappedTipsSchema.parse(response.data).data;
    },
    staleTime: 60_000,
  });
}

function invalidateTipsQueries(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: tipsQueryKey() }),
    queryClient.invalidateQueries({ queryKey: ["dashboard", "summary"] }),
  ]);
}

export function usePinTip() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (tipId: string) => {
      await api.post(`/tips/${tipId}/pin`);
    },
    onSuccess: async () => invalidateTipsQueries(queryClient),
  });
}

export function useUnpinTip() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (tipId: string) => {
      await api.post(`/tips/${tipId}/unpin`);
    },
    onSuccess: async () => invalidateTipsQueries(queryClient),
  });
}

export function useDismissTip() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (tipId: string) => {
      await api.post(`/tips/${tipId}/dismiss`);
    },
    onSuccess: async () => invalidateTipsQueries(queryClient),
  });
}
