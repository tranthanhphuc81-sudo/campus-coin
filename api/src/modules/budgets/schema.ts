import { z } from "zod";

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const decimalPattern = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/;

export const budgetsMonthQuerySchema = z.object({
  month: z.string().regex(monthPattern, "month must use YYYY-MM format."),
});

export const upsertBudgetsBodySchema = z.object({
  month: z.string().regex(monthPattern, "month must use YYYY-MM format."),
  items: z
    .array(
      z.object({
        categoryId: z.number().int().positive(),
        limitAmount: z
          .string()
          .trim()
          .regex(decimalPattern, "limitAmount must be a positive decimal with up to 2 digits."),
        alertThresholdPct: z.number().int().min(50).max(100).optional(),
      }),
    )
    .min(1, "At least one budget item is required."),
});

export const copyPreviousBudgetsBodySchema = z.object({
  month: z.string().regex(monthPattern, "month must use YYYY-MM format."),
});

export const budgetIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});
