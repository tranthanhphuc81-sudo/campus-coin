import { z } from "zod";

export const categoryTypeSchema = z.enum(["income", "expense"]);

export const listCategoriesQuerySchema = z.object({
  type: categoryTypeSchema,
});

export const createCategoryBodySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Category name is required.")
    .max(50, "Category name must be 50 characters or fewer."),
  type: categoryTypeSchema,
  icon: z.string().trim().min(1).max(40).optional(),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Color must be a valid hex code like #1A2B3C.")
    .optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
});

export const updateCategoryBodySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Category name is required.")
      .max(50, "Category name must be 50 characters or fewer.")
      .optional(),
    icon: z.string().trim().min(1).max(40).nullable().optional(),
    color: z
      .string()
      .trim()
      .regex(/^#[0-9A-Fa-f]{6}$/, "Color must be a valid hex code like #1A2B3C.")
      .nullable()
      .optional(),
    sortOrder: z.number().int().min(0).max(999).optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "At least one field is required.",
  });

export const categoryIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const deleteCategoryQuerySchema = z.object({
  reassignTo: z.coerce.number().int().positive().optional(),
});
