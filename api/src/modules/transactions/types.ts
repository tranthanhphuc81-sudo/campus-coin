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
};

export type UpdateTransactionInput = {
  categoryId?: number;
  type?: TransactionWireType;
  amount?: string;
  description?: string | null;
  txnDate?: string;
};
