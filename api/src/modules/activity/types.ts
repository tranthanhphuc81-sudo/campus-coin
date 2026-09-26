export type RecentActivityItem = {
  id: string;
  transactionId: string;
  activityType: "viewed" | "edited";
  categoryName: string;
  amount: string;
  description: string | null;
  txnDate: string;
  createdAt: string;
};

export type RecentActivityResponse = {
  items: RecentActivityItem[];
};
