/**
 * transaction.ts
 * Zod schemas and DTO types for the transactions module (income/expense records, optimistic
 * locking, soft delete/trash, anomaly/duplicate flags, inline recurring creation).
 * Every body schema is `.strict()` so unexpected fields — in particular `userId`, `version`
 * on create, `source`, `merchantKey`, `categorySource` — are rejected with 422 instead of
 * silently ignored. D1 (P10): `categorySource` is never accepted from the client — the server
 * derives it (backend/src/modules/transactions/categorySource.ts) so a client can't fake AI
 * quality stats or skip AI-learning.
 * Main exports: recurringInlineSchema, createTransactionSchema, updateTransactionSchema,
 *   listTransactionsQuerySchema, resolveFlagSchema + inferred *Input types,
 *   TransactionDto, TransactionHistoryDto
 * Spec: docs/spec/05a §5.4 (transactions) · Rules: BR-TX-01..08
 */
import { z } from 'zod';
import { RecurringFrequency, TransactionType } from '../enums.js';
import type { CategorySource, TransactionSource } from '../enums.js';
import {
  CATEGORY_FILTER_MAX_IDS,
  DESCRIPTION_MAX_LENGTH,
  PAGE_NUMBER_MAX,
  PAGE_SIZE_DEFAULT,
  PAGE_SIZE_MAX,
  RECURRING_INTERVAL_MAX,
  TXN_SEARCH_MAX_LENGTH,
} from '../constants.js';
import { MAX_INT_ID, localDateSchema, moneyFilterSchema, moneyStringSchema } from './common.js';

/** `aiConfidence`: a decimal string in `[0, 1]` with up to 3 fraction digits, e.g. `"0.874"`. */
// Bounded digit counts (max 3 fraction digits), so this cannot backtrack catastrophically.
// eslint-disable-next-line security/detect-unsafe-regex
const AI_CONFIDENCE = /^(0(\.\d{1,3})?|1(\.0{1,3})?)$/;

/** Comma-separated list of up to {@link CATEGORY_FILTER_MAX_IDS} small positive integers. */
// CATEGORY_FILTER_MAX_IDS is a fixed internal constant, never client input, so this is not a
// ReDoS-relevant dynamic-regex construction.
// eslint-disable-next-line security/detect-non-literal-regexp
const CATEGORY_ID_LIST = new RegExp(`^\\d{1,10}(,\\d{1,10}){0,${CATEGORY_FILTER_MAX_IDS - 1}}$`);

/** Optional recurring rule created together with a transaction (`POST /transactions`). */
export const recurringInlineSchema = z
  .object({
    frequency: z.enum(RecurringFrequency),
    intervalCount: z.number().int().min(1).max(RECURRING_INTERVAL_MAX).default(1),
    endDate: localDateSchema.nullable().optional(),
  })
  .strict();
/** Inferred input type of {@link recurringInlineSchema}. */
export type RecurringInlineInput = z.infer<typeof recurringInlineSchema>;

/** Body of `POST /transactions`. BR-TX-01 (amount > 0), BR-TX-02 (date range), BR-TX-03 (category ownership, checked server-side). */
export const createTransactionSchema = z
  .object({
    type: z.enum(TransactionType),
    categoryId: z.number().int().positive(),
    amount: moneyStringSchema,
    txnDate: localDateSchema,
    description: z.string().trim().max(DESCRIPTION_MAX_LENGTH, `Description must be at most ${DESCRIPTION_MAX_LENGTH} characters.`).nullable().optional(),
    aiSuggestedCategoryId: z.number().int().positive().nullable().optional(),
    aiConfidence: z.string().regex(AI_CONFIDENCE, 'Must be a decimal between 0 and 1.').nullable().optional(),
    recurring: recurringInlineSchema.optional(),
  })
  .strict();
/** Inferred input type of {@link createTransactionSchema}. */
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;

/**
 * Body of `PATCH /transactions/:id`. BR-TX-05: `version` is always required (optimistic locking —
 * the server rejects a stale `version` with 409 Conflict). No `recurring` field: a generated
 * transaction's recurring rule is edited via `/recurring-rules`, not through this endpoint.
 */
export const updateTransactionSchema = z
  .object({
    type: z.enum(TransactionType).optional(),
    categoryId: z.number().int().positive().optional(),
    amount: moneyStringSchema.optional(),
    txnDate: localDateSchema.optional(),
    description: z.string().trim().max(DESCRIPTION_MAX_LENGTH, `Description must be at most ${DESCRIPTION_MAX_LENGTH} characters.`).nullable().optional(),
    aiSuggestedCategoryId: z.number().int().positive().nullable().optional(),
    aiConfidence: z.string().regex(AI_CONFIDENCE, 'Must be a decimal between 0 and 1.').nullable().optional(),
    version: z.number().int().min(1),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 1, 'At least one field besides version must be provided.');
/** Inferred input type of {@link updateTransactionSchema}. */
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;

/** Query of `GET /transactions`. BR-TX-08: pagination + filters (date range, type, category, amount range, keyword) + sort. */
export const listTransactionsQuerySchema = z
  .object({
    from: localDateSchema.optional(),
    to: localDateSchema.optional(),
    type: z.enum(TransactionType).optional(),
    categoryId: z
      .string()
      .regex(CATEGORY_ID_LIST, `Provide up to ${CATEGORY_FILTER_MAX_IDS} comma-separated category ids.`)
      .transform((v) => v.split(',').map(Number))
      .refine((ids) => ids.every((id) => id <= MAX_INT_ID), 'Invalid category id.') // B-L1
      .optional(),
    q: z.string().trim().min(1).max(TXN_SEARCH_MAX_LENGTH).optional(),
    minAmount: moneyFilterSchema.optional(),
    maxAmount: moneyFilterSchema.optional(),
    sort: z.enum(['txnDate', '-txnDate', 'amount', '-amount', 'createdAt', '-createdAt']).default('-txnDate'),
    page: z.coerce.number().int().min(1).max(PAGE_NUMBER_MAX).default(1), // B-L8: bounds an unbounded OFFSET.
    limit: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(PAGE_SIZE_DEFAULT),
    deleted: z
      .enum(['true', 'false'])
      .optional()
      .default('false')
      .transform((v) => v === 'true'),
  })
  .strict()
  .superRefine((v, ctx) => {
    // Plain string comparison is valid for ISO `YYYY-MM-DD` dates.
    if (v.from && v.to && v.from > v.to) {
      ctx.addIssue({ code: 'custom', path: ['to'], message: 'to must not be before from.' });
    }
  });
/** Inferred input type of {@link listTransactionsQuerySchema}. */
export type ListTransactionsQueryInput = z.infer<typeof listTransactionsQuerySchema>;

/**
 * Body of `POST /transactions/:id/resolve-flag` — resolving an anomaly/duplicate flag (§5.14).
 * `action: 'keep'` clears the flag: the transaction is confirmed fine as-is (`isAnomaly`/
 * `isPossibleDuplicate` -> false). `action: 'delete'` soft-deletes the transaction outright
 * (same as `DELETE /transactions/:id`); only valid while the targeted flag is still `true` —
 * the server rejects it otherwise so a client can't delete a transaction via a stale flag.
 * P14: this replaces the earlier `confirm|dismiss` wire contract (no shipped UI used it yet).
 */
export const resolveFlagSchema = z
  .object({
    flag: z.enum(['anomaly', 'duplicate']),
    action: z.enum(['keep', 'delete']),
  })
  .strict();
/** Inferred input type of {@link resolveFlagSchema}. */
export type ResolveFlagInput = z.infer<typeof resolveFlagSchema>;

/** Shape of a transaction as returned by the API (never exposes `userId`/`merchantKey`/`importBatchId`). */
export interface TransactionDto {
  id: string;
  type: TransactionType;
  categoryId: number;
  category: { id: number; name: string; type: TransactionType; icon: string | null; color: string | null };
  amount: string;
  currency: string;
  description: string | null;
  txnDate: string;
  source: TransactionSource;
  recurringRuleId: number | null;
  recurringPeriod: string | null;
  categorySource: CategorySource;
  aiSuggestedCategoryId: number | null;
  aiConfidence: string | null;
  isAnomaly: boolean;
  isPossibleDuplicate: boolean;
  version: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One append-only audit entry for a transaction (BR-TX-06: full edit/delete history). */
export interface TransactionHistoryDto {
  id: string;
  action: string;
  snapshot: unknown;
  changedFields: unknown;
  changedBy: string;
  changedAt: string;
}
