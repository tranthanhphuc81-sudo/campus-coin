export type BudgetLevel = "ok" | "near" | "exceeded";

export type BudgetDto = {
  id: number;
  categoryId: number;
  categoryName: string;
  month: string;
  limitAmount: string;
  alertThresholdPct: number;
  spent: string;
  percent: number;
  level: BudgetLevel;
};

export type UpsertBudgetItemInput = {
  categoryId: number;
  limitAmount: string;
  alertThresholdPct?: number;
};

export type UpsertBudgetsInput = {
  month: string;
  items: UpsertBudgetItemInput[];
};

export type CopyPreviousBudgetsInput = {
  month: string;
};
