import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

import api from "@/lib/api";

const insightItemSchema = z.object({
  month: z.string(),
  status: z.string(),
  summaryText: z.string(),
  tipText: z.string(),
  generator: z.enum(["llm", "template"]),
  regenerateCount: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const insightFlaggedPatternSchema = z.object({
  categoryId: z.number(),
  name: z.string(),
  cur: z.string(),
  avg3: z.string().nullable(),
  g: z.number().nullable(),
  absDiff: z.string().nullable(),
  overBudget: z.boolean(),
  flagged: z.boolean(),
  isNew: z.boolean(),
});

const insightDetailSchema = insightItemSchema.extend({
  statsSnapshot: z.unknown(),
  flaggedPatterns: z.array(insightFlaggedPatternSchema),
});

const wrappedInsightListSchema = z.object({
  data: z.array(insightItemSchema),
});

const wrappedInsightDetailSchema = z.object({
  data: insightDetailSchema,
});

export type InsightItem = z.infer<typeof insightItemSchema>;
export type InsightDetail = z.infer<typeof insightDetailSchema>;

export function insightsQueryKey() {
  return ["insights", "list"] as const;
}

export function insightDetailQueryKey(month: string | null) {
  return ["insights", "detail", month] as const;
}

export function useInsightsList() {
  return useQuery({
    queryKey: insightsQueryKey(),
    queryFn: async () => {
      const response = await api.get("/insights");
      return wrappedInsightListSchema.parse(response.data).data;
    },
  });
}

export function useInsightDetail(month: string | null) {
  return useQuery({
    queryKey: insightDetailQueryKey(month),
    queryFn: async () => {
      const response = await api.get(`/insights/${month}`);
      return wrappedInsightDetailSchema.parse(response.data).data;
    },
    enabled: Boolean(month),
  });
}

export function useRegenerateInsight() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (month: string) => {
      const response = await api.post(`/insights/${month}/regenerate`);
      return response.data as { data: { accepted: boolean } };
    },
    onSuccess: async (_data, month) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: insightsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: insightDetailQueryKey(month) }),
        queryClient.invalidateQueries({ queryKey: ["dashboard", "summary"] }),
      ]);
    },
  });
}
