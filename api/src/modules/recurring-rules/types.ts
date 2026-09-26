export type RecurringFrequencyWire = "weekly" | "monthly" | "yearly";
export type RecurringTypeWire = "income" | "expense";

export type RecurringRuleDto = {
  id: number;
  categoryId: number;
  type: RecurringTypeWire;
  amount: string;
  description: string | null;
  frequency: RecurringFrequencyWire;
  intervalCount: number;
  dayOfMonth: number | null;
  dayOfWeek: number | null;
  startDate: string;
  endDate: string | null;
  nextRunDate: string;
  isActive: boolean;
};

export type CreateRecurringRuleInput = {
  categoryId: number;
  type: RecurringTypeWire;
  amount: string;
  description?: string;
  frequency: RecurringFrequencyWire;
  intervalCount?: number;
  dayOfMonth?: number;
  dayOfWeek?: number;
  startDate: string;
  endDate?: string;
};

export type UpdateRecurringRuleInput = {
  categoryId?: number;
  amount?: string;
  description?: string | null;
  intervalCount?: number;
  dayOfMonth?: number | null;
  dayOfWeek?: number | null;
  endDate?: string | null;
  isActive?: boolean;
};
