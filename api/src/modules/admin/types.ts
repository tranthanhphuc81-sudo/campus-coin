export type AdminUserListItem = {
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

export type AdminUserDetail = AdminUserListItem;

export type AdminUsersPage = {
  data: AdminUserListItem[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
};

export type AdminOverviewStats = {
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

export type AdminCategoryUsageItem = {
  categoryId: number;
  name: string;
  usageCount: number;
  distinctUserCount: number;
};

export type AdminCategoryUsageResponse = {
  data: AdminCategoryUsageItem[];
  other: {
    usageCount: number;
  } | null;
};

export type AuditLogItem = {
  id: string;
  actorId: string;
  actorRole: "student" | "admin";
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type AuditLogsPage = {
  data: AuditLogItem[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
};

export type AnnouncementActiveItem = {
  id: number;
  title: string;
  body: string;
  level: "info" | "warning";
  startsAt: string;
  endsAt: string | null;
};
