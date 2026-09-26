export type TransactionWireType = "income" | "expense";

export type TransactionWireSource = "manual" | "recurring" | "csv_import";

export type TransactionDto = {
  id: string;
  categoryId: number;
  categoryName: string;
  type: TransactionWireType;
  amount: string;
  description: string | null;
  source: TransactionWireSource;
  isAnomaly: boolean;
  isPossibleDuplicate: boolean;
  txnDate: string;
  createdAt: string;
  updatedAt: string;
};

export type ListTransactionsQueryInput = {
  month?: string;
  type?: TransactionWireType;
  categoryId?: number;
  q?: string;
};

export type CreateTransactionInput = {
  categoryId: number;
  type: TransactionWireType;
  amount: string;
  description?: string;
  txnDate: string;
  categorySource?: "user" | "ai_accepted" | "ai_overridden";
  aiSuggestedCategoryId?: number | null;
  aiConfidence?: number | null;
};

export type UpdateTransactionInput = {
  categoryId?: number;
  type?: TransactionWireType;
  amount?: string;
  description?: string | null;
  txnDate?: string;
  categorySource?: "user" | "ai_accepted" | "ai_overridden";
  aiSuggestedCategoryId?: number | null;
  aiConfidence?: number | null;
};

export type ResolveTransactionFlagInput = {
  flag: "anomaly" | "duplicate";
  action: "keep" | "delete";
};
