export type CategoryHistoryMonth = {
  month: string;
  amount: string;
  hasActivity: boolean;
};

export type CategoryMonthlyInput = {
  categoryId: number;
  name: string;
  cur: string;
  history: CategoryHistoryMonth[];
  budgetLimit: string | null;
};

export type LargestAnomalyInput = {
  transactionId: string;
  categoryId: number;
  categoryName: string;
  amount: string;
  txnDate: string;
} | null;

export type ComputeMonthStatsInput = {
  userId: string;
  month: string;
  currency: string;
  baselineAllowance: string | null;
  totalIncome: string;
  totalExpense: string;
  categories: CategoryMonthlyInput[];
  largestAnomaly: LargestAnomalyInput;
};

export type CategoryStat = {
  categoryId: number;
  name: string;
  cur: string;
  avg3: string | null;
  monthsInAvg3: number;
  g: number | null;
  absDiff: string | null;
  overBudget: boolean;
  flagged: boolean;
  isNew: boolean;
};

export type NewCategoryStat = {
  categoryId: number;
  name: string;
  cur: string;
};

export type WeeklyCapSuggestion = {
  categoryId: number;
  categoryName: string;
  amount: string;
} | null;

export type MonthStatsSnapshot = {
  userId: string;
  month: string;
  currency: string;
  baselineAllowance: string | null;
  totalIncome: string;
  totalExpense: string;
  savingsRate: number | null;
  categories: CategoryStat[];
  topPatterns: CategoryStat[];
  newCategories: NewCategoryStat[];
  largestAnomaly: LargestAnomalyInput;
  weeklyCapSuggestion: WeeklyCapSuggestion;
  monthsConsideredForAvg3: string[];
};

export type PromptTopPattern = {
  category: string;
  curAmount: string;
  avg3Amount: string;
  growthPct: number;
};

export type PromptStatsInput = {
  month: string;
  currency: string;
  totalIncome: string;
  totalExpense: string;
  savingsRatePct: number | null;
  topPatterns: PromptTopPattern[];
  newCategories: string[];
  largestAnomaly: { category: string; amount: string } | null;
  weeklyCapSuggestion: { category: string; amount: string; substitutionTip: string } | null;
};

export type InsightGenerationResult = {
  summaryText: string;
  tipText: string;
  generator: "llm" | "template";
};
