import { z } from "zod";

const targetTypeSchema = z.enum(["tip", "insight", "report"]);

const targetRefSchema = z
  .string()
  .trim()
  .min(1, "targetRef is required.")
  .max(255, "targetRef must be 255 characters or fewer.");

const noteSchema = z
  .string()
  .trim()
  .max(500, "note must be 500 characters or fewer.")
  .transform((value) => (value.length === 0 ? null : value));

export const listBookmarksQuerySchema = z.object({
  targetType: targetTypeSchema.optional(),
  targetRef: targetRefSchema.optional(),
  q: z.string().trim().max(500).optional(),
});

export const createBookmarkBodySchema = z.object({
  targetType: targetTypeSchema,
  targetRef: targetRefSchema,
  note: noteSchema.optional(),
});

export const updateBookmarkBodySchema = z.object({
  targetType: targetTypeSchema,
  targetRef: targetRefSchema,
  note: noteSchema.nullable(),
});

export const deleteBookmarkBodySchema = z.object({
  targetType: targetTypeSchema,
  targetRef: targetRefSchema,
});
