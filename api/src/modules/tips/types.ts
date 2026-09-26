export type TipItem = {
  id: string;
  ruleType:
    | "over_budget"
    | "above_average"
    | "small_frequent"
    | "subscriptions"
    | "savings_gap"
    | "weekend_spike"
    | "general";
  categoryId: number | null;
  title: string;
  body: string;
  impactAmount: string;
  score: number;
  status: "active" | "pinned";
  createdAt: string;
  updatedAt: string;
};

export type TipsResponse = {
  month: string;
  generatedAt: string;
  tips: TipItem[];
};
