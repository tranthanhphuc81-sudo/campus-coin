import { z } from "zod";

export const importBatchIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const importRowsPatchBodySchema = z.object({
  rows: z
    .array(
      z.object({
        id: z.string(),
        selected: z.boolean().optional(),
        categoryId: z.number().int().positive().nullable().optional(),
      }),
    )
    .min(1)
    .max(5000),
});

export const importUploadBodySchema = z.object({
  dateFormat: z.enum(["YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY"]),
});
