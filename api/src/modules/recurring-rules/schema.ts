import { z } from "zod";

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const recurringFrequencySchema = z.enum(["weekly", "monthly", "yearly"]);
export const recurringTypeSchema = z.enum(["income", "expense"]);

export const recurringRuleIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const createRecurringRuleBodySchema = z
  .object({
    categoryId: z.number().int().positive(),
    type: recurringTypeSchema,
    amount: z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/, "Amount must be a decimal string with up to 2 decimals."),
    description: z.string().trim().max(255).optional(),
    frequency: recurringFrequencySchema,
    intervalCount: z.number().int().min(1).max(12).optional(),
    dayOfMonth: z.number().int().min(1).max(31).optional(),
    dayOfWeek: z.number().int().min(1).max(7).optional(),
    startDate: z.string().regex(dateRegex, "startDate must use YYYY-MM-DD format."),
    endDate: z.string().regex(dateRegex, "endDate must use YYYY-MM-DD format.").optional(),
  })
  .superRefine((payload, context) => {
    if (payload.frequency === "monthly" && payload.dayOfMonth === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dayOfMonth"],
        message: "dayOfMonth is required for monthly recurring rules.",
      });
    }

    if (payload.frequency === "weekly" && payload.dayOfWeek === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dayOfWeek"],
        message: "dayOfWeek is required for weekly recurring rules.",
      });
    }

    if (payload.endDate && payload.endDate < payload.startDate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "endDate must be greater than or equal to startDate.",
      });
    }
  });

export const updateRecurringRuleBodySchema = z
  .object({
    categoryId: z.number().int().positive().optional(),
    amount: z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/, "Amount must be a decimal string with up to 2 decimals.")
      .optional(),
    description: z.string().trim().max(255).nullable().optional(),
    intervalCount: z.number().int().min(1).max(12).optional(),
    dayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
    dayOfWeek: z.number().int().min(1).max(7).nullable().optional(),
    endDate: z.string().regex(dateRegex, "endDate must use YYYY-MM-DD format.").nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "At least one field is required.",
  });
