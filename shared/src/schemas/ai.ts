/**
 * ai.ts
 * Zod schemas and DTO types for the AI categorization module: interactive tier-1/2/3 category
 * suggestions and the feedback endpoint that teaches tier-1 personal rules from a user's choice.
 * Both bodies are `.strict()` so unexpected fields (in particular `userId`, `tier`, `confidence`)
 * are rejected with 422 instead of silently ignored.
 * Main exports: categorizeSuggestSchema, aiFeedbackSchema + inferred *Input types, AiTier,
 *   CategorySuggestionDto
 * Spec: docs/spec/05b (AI categorization, 3-tier) · Rules: BR-AI-01..05
 */
import { z } from 'zod';
import { TransactionType } from '../enums.js';
import { AI_SUGGEST_MIN_CHARS, DESCRIPTION_MAX_LENGTH } from '../constants.js';

/** Body of `POST /ai/categorize/suggest`. */
export const categorizeSuggestSchema = z
  .object({
    description: z.string().trim().min(AI_SUGGEST_MIN_CHARS).max(DESCRIPTION_MAX_LENGTH),
    type: z.enum(TransactionType),
  })
  .strict();
/** Inferred input type of {@link categorizeSuggestSchema}. */
export type CategorizeSuggestInput = z.infer<typeof categorizeSuggestSchema>;

/**
 * Body of `POST /ai/feedback` (D10: exists for P11's CSV importer too — `merchantKey` accepts any
 * free text, re-normalised server-side, so a raw description also works).
 */
export const aiFeedbackSchema = z
  .object({
    transactionId: z.uuid().optional(),
    merchantKey: z.string().trim().min(1).max(DESCRIPTION_MAX_LENGTH),
    suggestedCategoryId: z.number().int().positive().nullable(),
    chosenCategoryId: z.number().int().positive(),
  })
  .strict();
/** Inferred input type of {@link aiFeedbackSchema}. */
export type AiFeedbackInput = z.infer<typeof aiFeedbackSchema>;

/** Which tier produced a {@link CategorySuggestionDto}: 1 = personal rule, 2 = keyword, 3 = LLM. */
export type AiTier = 1 | 2 | 3;

/** A category suggestion returned by `POST /ai/categorize/suggest`. */
export interface CategorySuggestionDto {
  categoryId: number;
  categoryName: string;
  /** Decimal string in `[0, 1]` with up to 3 fraction digits, e.g. `"0.850"` (matches `transactions.ai_confidence`). */
  confidence: string;
  tier: AiTier;
}
