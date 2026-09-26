import { notificationsResponseSchema } from "@campus-coin/shared";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import api from "@/lib/api";

export function notificationsQueryKey(page: number, limit: number) {
  return ["notifications", page, limit] as const;
}

export async function invalidateNotificationsAndBudgets(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["notifications"] }),
    queryClient.invalidateQueries({ queryKey: ["budgets"] }),
  ]);
}

export function useNotifications(page = 1, limit = 8, refetchInterval = 60000) {
  return useQuery({
    queryKey: notificationsQueryKey(page, limit),
    queryFn: async () => {
      const response = await api.get("/notifications", {
        params: { page, limit },
      });

      return notificationsResponseSchema.parse(response.data);
    },
    refetchInterval,
  });
}

export function useReadNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await api.post(`/notifications/${id}/read`);
      return response.data as { read: boolean };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useReadAllNotifications() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await api.post("/notifications/read-all");
      return response.data as { updated: number };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}
