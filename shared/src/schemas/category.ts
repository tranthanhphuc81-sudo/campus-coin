/**
 * category.ts
 * Zod schemas and DTO types for the categories module (income/expense categories, personal or
 * system default). Every body schema is `.strict()` so unexpected fields — in particular
 * `isDefault`, `ownerKey`, `userId` — are rejected with 422 instead of silently ignored.
 * Main exports: categoryNameSchema, createCategorySchema, updateCategorySchema,
 *   listCategoriesQuerySchema, deleteCategoryQuerySchema + inferred *Input types, CategoryDto
 * Spec: docs/spec/05a §5.3 (categories) · Rules: BR-CA-01..05
 */
import { z } from 'zod';
import { TransactionType } from '../enums.js';
import { CATEGORY_NAME_MAX_LENGTH } from '../constants.js';
import { MAX_INT_ID } from './common.js';

const ICON_KEY = /^[a-z0-9-]{1,40}$/;
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

/**
 * Category display name: trimmed, internal whitespace runs collapsed to a single space, then
 * bounded to {@link CATEGORY_NAME_MAX_LENGTH} (BR-CA-01: 1–50 characters, per user/type).
 * Uniqueness (own categories + default categories of the same type) is checked server-side.
 */
export const categoryNameSchema = z
  .string()
  .trim()
  .min(1, 'Category name is required.')
  .transform((v) => v.replace(/\s+/g, ' '))
  .pipe(
    z
      .string()
      .max(CATEGORY_NAME_MAX_LENGTH, `Category name must be at most ${CATEGORY_NAME_MAX_LENGTH} characters.`),
  );

/** Body of `POST /categories`. `type` is immutable once set (BR-CA-01, BR-CA-02). */
export const createCategorySchema = z
  .object({
    name: categoryNameSchema,
    type: z.enum(TransactionType),
    icon: z.string().regex(ICON_KEY, 'Invalid icon key.').optional(),
    color: z.string().regex(HEX_COLOR, 'Must be a hex colour, e.g. "#3366FF".').optional(),
  })
  .strict();
/** Inferred input type of {@link createCategorySchema}. */
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

/**
 * Body of `PATCH /categories/:id`. No `type` field — a category's type never changes after
 * creation (BR-CA-01). Only a user's own personal categories can be updated (BR-CA-02).
 */
export const updateCategorySchema = z
  .object({
    name: categoryNameSchema.optional(),
    icon: z.string().regex(ICON_KEY, 'Invalid icon key.').nullable().optional(),
    color: z.string().regex(HEX_COLOR, 'Must be a hex colour, e.g. "#3366FF".').nullable().optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(32767).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'At least one field must be provided.');
/** Inferred input type of {@link updateCategorySchema}. */
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

/** Query of `GET /categories`. */
export const listCategoriesQuerySchema = z
  .object({
    type: z.enum(TransactionType).optional(),
    includeInactive: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => v === 'true'),
  })
  .strict();
/** Inferred input type of {@link listCategoriesQuerySchema}. */
export type ListCategoriesQueryInput = z.infer<typeof listCategoriesQuerySchema>;

/**
 * Query of `DELETE /categories/:id`. BR-CA-03: deleting a category that still has transactions
 * requires either reassigning them to another category, or archiving (`is_active = false`)
 * instead of deleting — never both at once.
 */
export const deleteCategoryQuerySchema = z
  .object({
    reassignTo: z
      .string()
      .regex(/^\d{1,10}$/, 'Invalid category id.')
      .transform(Number)
      .refine((n) => n <= MAX_INT_ID, 'Invalid category id.') // B-L1: bounds an out-of-range id.
      .optional(),
    archive: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => v === 'true'),
  })
  .strict()
  .refine((v) => !(v.reassignTo !== undefined && v.archive), 'Provide either reassignTo or archive, not both.');
/** Inferred input type of {@link deleteCategoryQuerySchema}. */
export type DeleteCategoryQueryInput = z.infer<typeof deleteCategoryQuerySchema>;

/** Shape of a category as returned by the API (never exposes `ownerKey`/`userId`). */
export interface CategoryDto {
  id: number;
  name: string;
  type: TransactionType;
  icon: string | null;
  color: string | null;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
}
