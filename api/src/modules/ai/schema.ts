import { z } from "zod";

const amountRegex = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/;

export const suggestBodySchema = z.object({
  description: z.string().trim().min(1).max(255),
  amount: z
    .string()
    .trim()
    .regex(amountRegex, "amount must be a decimal string with up to 2 decimals."),
  type: z.enum(["income", "expense"]),
});

export const feedbackBodySchema = z.object({
  description: z.string().trim().min(1).max(255),
  suggestedCategoryId: z.number().int().positive().nullable(),
  chosenCategoryId: z.number().int().positive(),
});
