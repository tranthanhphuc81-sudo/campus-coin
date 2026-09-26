import { z } from "zod";

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const datePattern = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export const dashboardSummaryQuerySchema = z.object({
  month: z.string().regex(monthPattern, "month must use YYYY-MM format."),
  timezone: z.string().trim().min(1).max(60).optional(),
});

export const categoryBreakdownQuerySchema = z
  .object({
    from: z.string().regex(datePattern, "from must use YYYY-MM-DD format."),
    to: z.string().regex(datePattern, "to must use YYYY-MM-DD format."),
    type: z.enum(["income", "expense"]).default("expense"),
    categoryId: z
      .preprocess(
        (value) => (value === undefined || value === "" ? undefined : value),
        z.coerce.number().int().positive(),
      )
      .optional(),
  })
  .refine((input) => input.from <= input.to, {
    message: "from must be before or equal to to.",
    path: ["to"],
  });

export const incomeVsExpenseQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(24).default(6),
});

export const dailyWeeklyQuerySchema = z.object({
  month: z.string().regex(monthPattern, "month must use YYYY-MM format."),
});

export const monthlyExportQuerySchema = z.object({
  month: z.string().regex(monthPattern, "month must use YYYY-MM format."),
  format: z.enum(["pdf"]).default("pdf"),
});

export const monthlyShareBodySchema = z.object({
  month: z.string().regex(monthPattern, "month must use YYYY-MM format."),
  toEmail: z
    .string()
    .trim()
    .toLowerCase()
    .email("toEmail must be a valid email address.")
    .max(254, "toEmail must be 254 characters or fewer."),
});
