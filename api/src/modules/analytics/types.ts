export type WireTransactionType = "income" | "expense";

export type DashboardGreeting = {
  message: string;
  timezone: string;
  localDate: string;
};

export type DashboardTotals = {
  income: string;
  expense: string;
  net: string;
  vsPrevMonthPct: number | null;
};

export type DashboardTopCategory = {
  categoryId: number;
  categoryName: string;
  amount: string;
  sharePct: number;
  transactionCount: number;
};

export type DashboardBudgetVsActual = {
  budgetId: number;
  categoryId: number;
  categoryName: string;
  limitAmount: string;
  spent: string;
  percent: number;
  level: "ok" | "near" | "exceeded";
};

export type DashboardCategoryBreakdownItem = {
  categoryId: number;
  categoryName: string;
  amount: string;
  sharePct: number;
  transactionCount: number;
};

export type DashboardTrendItem = {
  month: string;
  income: string;
  expense: string;
  net: string;
};

export type DashboardSavingsGoalProgress = {
  goalAmount: string;
  netAmount: string;
  progressPct: number;
  status: "not_set" | "on_track" | "behind";
};

export type DashboardSummaryResponse = {
  greeting: DashboardGreeting;
  totals: DashboardTotals;
  topCategory: DashboardTopCategory | null;
  budgetVsActual: DashboardBudgetVsActual[];
  categoryBreakdown: DashboardCategoryBreakdownItem[];
  trend6Months: DashboardTrendItem[];
  savingsGoalProgress: DashboardSavingsGoalProgress;
  latestInsight: {
    month: string;
    summaryText: string;
    tipText: string;
    generator: "llm" | "template";
  } | null;
  recentActivity: [];
  activeAnnouncements: [];
  tips: [];
};

export type CategoryBreakdownItem = {
  categoryId: number;
  categoryName: string;
  amount: string;
  sharePct: number;
  transactionCount: number;
};

export type CategoryBreakdownResponse = {
  filters: {
    from: string;
    to: string;
    type: WireTransactionType;
    categoryId: number | null;
  };
  previousRange: {
    from: string;
    to: string;
  };
  totalAmount: string;
  totalTransactions: number;
  previousTotalAmount: string;
  deltaAmount: string;
  deltaPct: number | null;
  items: CategoryBreakdownItem[];
};

export type IncomeVsExpenseResponse = {
  months: number;
  data: Array<{
    month: string;
    income: string;
    expense: string;
    net: string;
  }>;
};

export type DailyWeeklyResponse = {
  month: string;
  daily: Array<{
    date: string;
    income: string;
    expense: string;
    net: string;
  }>;
  weekly: Array<{
    isoWeek: string;
    weekStartDate: string;
    income: string;
    expense: string;
    net: string;
  }>;
  averageDailyExpense: string;
};
