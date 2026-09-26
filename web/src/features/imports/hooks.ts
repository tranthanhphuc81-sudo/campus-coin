import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

import api from "@/lib/api";

const importRowErrorSchema = z.object({
  field: z.enum(["date", "amount", "type", "description", "category"]),
  message: z.string(),
});

const importPreviewRowSchema = z.object({
  id: z.string(),
  rowNumber: z.number().int().positive(),
  date: z.string().nullable(),
  amount: z.string().nullable(),
  type: z.enum(["income", "expense"]).nullable(),
  description: z.string().nullable(),
  categoryId: z.number().int().positive().nullable(),
  categoryName: z.string().nullable(),
  selected: z.boolean(),
  duplicate: z.boolean(),
  errors: z.array(importRowErrorSchema),
});

export const importBatchSchema = z.object({
  batchId: z.string(),
  status: z.enum(["uploaded", "parsing", "previewed", "committed", "failed", "expired"]),
  totalRows: z.number().int().min(0),
  validRows: z.number().int().min(0),
  committedRows: z.number().int().min(0),
  createdAt: z.string(),
  updatedAt: z.string(),
  preview: z.array(importPreviewRowSchema),
  errors: z.array(
    z.object({
      rowNumber: z.number().int().positive(),
      messages: z.array(z.string()),
    }),
  ),
});

const commitImportSchema = z.object({
  batchId: z.string(),
  committedRows: z.number().int().min(0),
  skippedRows: z.number().int().min(0),
  status: z.literal("committed"),
});

export type ImportBatch = z.infer<typeof importBatchSchema>;
export type CommitImportResult = z.infer<typeof commitImportSchema>;

export function useUploadImport() {
  return useMutation({
    mutationFn: async (payload: {
      file: File;
      dateFormat: "YYYY-MM-DD" | "DD/MM/YYYY" | "MM/DD/YYYY";
    }) => {
      const formData = new FormData();
      formData.append("file", payload.file);
      formData.append("dateFormat", payload.dateFormat);

      const response = await api.post("/imports", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      return importBatchSchema.parse(response.data);
    },
  });
}

export function useGetImportBatch() {
  return useMutation({
    mutationFn: async (batchId: string) => {
      const response = await api.get(`/imports/${batchId}`);
      return importBatchSchema.parse(response.data);
    },
  });
}

export function usePatchImportRows() {
  return useMutation({
    mutationFn: async (payload: {
      batchId: string;
      rows: Array<{ id: string; selected?: boolean; categoryId?: number | null }>;
    }) => {
      const response = await api.patch(`/imports/${payload.batchId}/rows`, {
        rows: payload.rows,
      });

      return importBatchSchema.parse(response.data);
    },
  });
}

export function useCommitImport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { batchId: string; idempotencyKey: string }) => {
      const response = await api.post(
        `/imports/${payload.batchId}/commit`,
        {},
        {
          headers: {
            "Idempotency-Key": payload.idempotencyKey,
          },
        },
      );

      return commitImportSchema.parse(response.data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}

export async function downloadImportTemplate(): Promise<void> {
  const response = await api.get("/imports/template", { responseType: "blob" });
  const blob = new Blob([response.data], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "campus-coin-import-template.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function downloadImportErrorReport(batchId: string): Promise<void> {
  const response = await api.get(`/imports/${batchId}/error-report`, { responseType: "blob" });
  const blob = new Blob([response.data], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `import-errors-${batchId}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
