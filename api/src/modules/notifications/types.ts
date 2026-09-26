export type NotificationDto = {
  id: string;
  type: "budget_near" | "budget_exceeded" | "insight_ready" | "anomaly" | "duplicate" | "system";
  title: string;
  body: string;
  payload: unknown;
  readAt: string | null;
  createdAt: string;
};

export type NotificationsPage = {
  data: NotificationDto[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  unreadCount: number;
};
