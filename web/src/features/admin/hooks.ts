import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import api from "@/lib/api";

type AdminPagination = {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

export type AdminOverview = {
  totalUsers: number;
  activeStudents: number;
  dau: number | null;
  mau: number | null;
  dauReason: "insufficient_data" | null;
  mauReason: "insufficient_data" | null;
  totalTransactions: number;
  aiAcceptanceRate: number;
  completedInsights: number;
  insightGenerators: {
    llm: number;
    template: number;
  };
};

export type AdminCategoryUsage = {
  data: Array<{
    categoryId: number;
    name: string;
    usageCount: number;
    distinctUserCount: number;
  }>;
  other: {
    usageCount: number;
  } | null;
};

export type AdminUserItem = {
  id: string;
  fullName: string;
  email: string;
  role: "student" | "admin";
  status: "pending" | "active" | "disabled";
  emailVerifiedAt: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  aiOptIn: boolean;
  transactionCount: number;
};

export type AdminUsersPage = {
  data: AdminUserItem[];
  pagination: AdminPagination;
};

export type AdminDefaultCategory = {
  id: number;
  name: string;
  type: "income" | "expense";
  icon: string | null;
  color: string | null;
  isActive: boolean;
  sortOrder: number;
};

export type AdminTipTemplate = {
  id: number;
  code: string;
  ruleType: string;
  titleTpl: string;
  bodyTpl: string;
  locale: string;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminAnnouncement = {
  id: number;
  title: string;
  body: string;
  level: "info" | "warning";
  startsAt: string;
  endsAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AdminAuditLog = {
  id: string;
  actorId: string;
  actorRole: "student" | "admin";
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type AdminAuditLogsPage = {
  data: AdminAuditLog[];
  pagination: AdminPagination;
};

const adminKeys = {
  overview: ["admin", "overview"] as const,
  categoriesUsage: ["admin", "categories-usage"] as const,
  users: (q: string, page: number) => ["admin", "users", q, page] as const,
  categories: ["admin", "default-categories"] as const,
  tipTemplates: ["admin", "tip-templates"] as const,
  announcements: ["admin", "announcements"] as const,
  auditLogs: (query: string, page: number) => ["admin", "audit-logs", query, page] as const,
};

export function useAdminOverview() {
  return useQuery({
    queryKey: adminKeys.overview,
    queryFn: async () => {
      const response = await api.get<AdminOverview>("/admin/stats/overview");
      return response.data;
    },
  });
}

export function useAdminCategoriesUsage() {
  return useQuery({
    queryKey: adminKeys.categoriesUsage,
    queryFn: async () => {
      const response = await api.get<AdminCategoryUsage>("/admin/stats/categories-usage");
      return response.data;
    },
  });
}

export function useAdminUsers(q: string, page: number, pageSize = 10) {
  return useQuery({
    queryKey: adminKeys.users(q, page),
    queryFn: async () => {
      const response = await api.get<AdminUsersPage>("/admin/users", {
        params: {
          q: q.trim() || undefined,
          page,
          pageSize,
        },
      });
      return response.data;
    },
  });
}

export function useAdminDisableUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      await api.post(`/admin/users/${userId}/disable`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
}

export function useAdminEnableUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      await api.post(`/admin/users/${userId}/enable`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
}

export function useAdminSendReset() {
  return useMutation({
    mutationFn: async (userId: string) => {
      await api.post(`/admin/users/${userId}/send-reset`);
    },
  });
}

export function useAdminDefaultCategories() {
  return useQuery({
    queryKey: adminKeys.categories,
    queryFn: async () => {
      const response = await api.get<{ data: AdminDefaultCategory[] }>("/admin/categories");
      return response.data.data;
    },
  });
}

export function useCreateAdminDefaultCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: Omit<AdminDefaultCategory, "id">) => {
      const response = await api.post<AdminDefaultCategory>("/admin/categories", payload);
      return response.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.categories });
    },
  });
}

export function useUpdateAdminDefaultCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      id: number;
      data: Partial<Omit<AdminDefaultCategory, "id">>;
    }) => {
      const response = await api.patch<AdminDefaultCategory>(
        `/admin/categories/${payload.id}`,
        payload.data,
      );
      return response.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.categories });
    },
  });
}

export function useDeleteAdminDefaultCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/admin/categories/${id}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.categories });
    },
  });
}

export function useAdminTipTemplates() {
  return useQuery({
    queryKey: adminKeys.tipTemplates,
    queryFn: async () => {
      const response = await api.get<{ data: AdminTipTemplate[] }>("/admin/tip-templates");
      return response.data.data;
    },
  });
}

export function useCreateAdminTipTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      payload: Omit<AdminTipTemplate, "id" | "createdBy" | "createdAt" | "updatedAt">,
    ) => {
      const response = await api.post<AdminTipTemplate>("/admin/tip-templates", payload);
      return response.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.tipTemplates });
    },
  });
}

export function useUpdateAdminTipTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      id: number;
      data: Partial<Omit<AdminTipTemplate, "id" | "createdBy" | "createdAt" | "updatedAt">>;
    }) => {
      const response = await api.patch<AdminTipTemplate>(
        `/admin/tip-templates/${payload.id}`,
        payload.data,
      );
      return response.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.tipTemplates });
    },
  });
}

export function useDeleteAdminTipTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/admin/tip-templates/${id}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.tipTemplates });
    },
  });
}

export function usePreviewTipTemplate() {
  return useMutation({
    mutationFn: async (payload: { titleTpl: string; bodyTpl: string }) => {
      const response = await api.post<{
        title: string;
        body: string;
        sampleValues: Record<string, string>;
      }>("/admin/tip-templates/preview", payload);
      return response.data;
    },
  });
}

export function useAdminAnnouncements() {
  return useQuery({
    queryKey: adminKeys.announcements,
    queryFn: async () => {
      const response = await api.get<{ data: AdminAnnouncement[] }>("/admin/announcements");
      return response.data.data;
    },
  });
}

export function useCreateAdminAnnouncement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Omit<AdminAnnouncement, "id" | "createdAt" | "updatedAt">) => {
      const response = await api.post<AdminAnnouncement>("/admin/announcements", payload);
      return response.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.announcements });
    },
  });
}

export function useUpdateAdminAnnouncement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      id: number;
      data: Partial<Omit<AdminAnnouncement, "id" | "createdAt" | "updatedAt">>;
    }) => {
      const response = await api.patch<AdminAnnouncement>(
        `/admin/announcements/${payload.id}`,
        payload.data,
      );
      return response.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.announcements });
    },
  });
}

export function useDeleteAdminAnnouncement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/admin/announcements/${id}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.announcements });
    },
  });
}

export function usePreviewAnnouncement() {
  return useMutation({
    mutationFn: async (payload: { title: string; body: string }) => {
      const response = await api.post<{
        title: string;
        body: string;
        sampleValues: Record<string, string>;
      }>("/admin/announcements/preview", payload);
      return response.data;
    },
  });
}

export function useAdminAuditLogs(query: string, page: number, pageSize = 20) {
  return useQuery({
    queryKey: adminKeys.auditLogs(query, page),
    queryFn: async () => {
      const response = await api.get<AdminAuditLogsPage>("/admin/audit-logs", {
        params: {
          action: query.trim() || undefined,
          page,
          pageSize,
        },
      });
      return response.data;
    },
  });
}
