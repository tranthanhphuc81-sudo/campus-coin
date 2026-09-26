export type ImportDateFormat = "YYYY-MM-DD" | "DD/MM/YYYY" | "MM/DD/YYYY";

export type ImportPreviewRowError = {
  field: "date" | "amount" | "type" | "description" | "category";
  message: string;
};

export type ImportPreviewRowDto = {
  id: string;
  rowNumber: number;
  date: string | null;
  amount: string | null;
  type: "income" | "expense" | null;
  description: string | null;
  categoryId: number | null;
  categoryName: string | null;
  selected: boolean;
  duplicate: boolean;
  errors: ImportPreviewRowError[];
};

export type ImportBatchDto = {
  batchId: string;
  status: "uploaded" | "parsing" | "previewed" | "committed" | "failed" | "expired";
  totalRows: number;
  validRows: number;
  committedRows: number;
  createdAt: string;
  updatedAt: string;
  preview: ImportPreviewRowDto[];
  errors: Array<{ rowNumber: number; messages: string[] }>;
};

export type ImportRowsPatchInput = {
  rows: Array<{
    id: string;
    selected?: boolean;
    categoryId?: number | null;
  }>;
};

export type CommitImportResult = {
  batchId: string;
  committedRows: number;
  skippedRows: number;
  status: "committed";
};

export type CsvTemplateResult = {
  fileName: string;
  content: string;
};
