import { z } from "zod";

const monthRegex = /^\d{4}-(0[1-9]|1[0-2])$/;
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const amountRegex = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/;

const transactionTypeSchema = z.enum(["income", "expense"]);

export const listTransactionsQuerySchema = z.object({
  month: z.string().regex(monthRegex, "month must use YYYY-MM format.").optional(),
  type: transactionTypeSchema.optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  q: z.string().trim().min(1).max(120).optional(),
});

export const createTransactionBodySchema = z.object({
  categoryId: z.number().int().positive(),
  type: transactionTypeSchema,
  amount: z
    .string()
    .trim()
    .regex(amountRegex, "amount must be a decimal string with up to 2 decimals."),
  description: z.string().trim().max(255).optional(),
  txnDate: z.string().regex(dateRegex, "txnDate must use YYYY-MM-DD format."),
  categorySource: z.enum(["user", "ai_accepted", "ai_overridden"]).optional(),
  aiSuggestedCategoryId: z.number().int().positive().nullable().optional(),
});

export const updateTransactionBodySchema = z
  .object({
    categoryId: z.number().int().positive().optional(),
    type: transactionTypeSchema.optional(),
    amount: z
      .string()
      .trim()
      .regex(amountRegex, "amount must be a decimal string with up to 2 decimals.")
      .optional(),
    description: z.string().trim().max(255).nullable().optional(),
    txnDate: z.string().regex(dateRegex, "txnDate must use YYYY-MM-DD format.").optional(),
    categorySource: z.enum(["user", "ai_accepted", "ai_overridden"]).optional(),
    aiSuggestedCategoryId: z.number().int().positive().nullable().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "At least one field is required.",
  });

export const transactionIdParamsSchema = z.object({
  id: z.string().uuid(),
});
