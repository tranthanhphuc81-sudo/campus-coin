/**
 * recurring.ts
 * Zod schemas and DTO types for recurring transaction rules (weekly/monthly/yearly, every N
 * periods; a daily job materialises the actual transactions — backend/src/lib/recurrence.ts).
 * Main exports: createRecurringRuleSchema, updateRecurringRuleSchema + inferred *Input types,
 *   RecurringRuleDto
 * Spec: docs/spec/05a §5.4.2 (recurring transactions)
 */
import { z } from 'zod';
import { RecurringFrequency, TransactionType } from '../enums.js';
import { DESCRIPTION_MAX_LENGTH, RECURRING_INTERVAL_MAX } from '../constants.js';
import { localDateSchema, moneyStringSchema } from './common.js';

/**
 * Cross-field checks shared by create: a `weekly` rule needs `dayOfWeek` (not `dayOfMonth`); a
 * `monthly`/`yearly` rule needs `dayOfMonth` (not `dayOfWeek`); `endDate` (if set) is not before
 * `startDate`.
 */
function checkFrequencyFields(
  v: { frequency: RecurringFrequency; dayOfMonth?: number | null; dayOfWeek?: number | null; startDate: string; endDate?: string | null },
  ctx: z.RefinementCtx,
): void {
  if (v.frequency === RecurringFrequency.WEEKLY) {
    if (v.dayOfWeek == null) ctx.addIssue({ code: 'custom', path: ['dayOfWeek'], message: 'dayOfWeek is required for a weekly rule.' });
    if (v.dayOfMonth != null) ctx.addIssue({ code: 'custom', path: ['dayOfMonth'], message: 'dayOfMonth must not be set for a weekly rule.' });
  } else {
    if (v.dayOfMonth == null) ctx.addIssue({ code: 'custom', path: ['dayOfMonth'], message: `dayOfMonth is required for a ${v.frequency} rule.` });
    if (v.dayOfWeek != null) ctx.addIssue({ code: 'custom', path: ['dayOfWeek'], message: `dayOfWeek must not be set for a ${v.frequency} rule.` });
  }
  if (v.endDate && v.endDate < v.startDate) {
    ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'endDate must not be before startDate.' });
  }
}

/**
 * Body of `POST /recurring-rules`. `type`/`startDate` are immutable after creation (changing the
 * anchor date or direction of money movement means delete + recreate, not an update).
 */
export const createRecurringRuleSchema = z
  .object({
    type: z.enum(TransactionType),
    categoryId: z.number().int().positive(),
    amount: moneyStringSchema,
    description: z.string().trim().max(DESCRIPTION_MAX_LENGTH, `Description must be at most ${DESCRIPTION_MAX_LENGTH} characters.`).nullable().optional(),
    frequency: z.enum(RecurringFrequency),
    intervalCount: z.number().int().min(1).max(RECURRING_INTERVAL_MAX).default(1),
    dayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
    dayOfWeek: z.number().int().min(1).max(7).nullable().optional(),
    startDate: localDateSchema,
    endDate: localDateSchema.nullable().optional(),
  })
  .strict()
  .superRefine(checkFrequencyFields);
/** Inferred input type of {@link createRecurringRuleSchema}. */
export type CreateRecurringRuleInput = z.infer<typeof createRecurringRuleSchema>;

/**
 * Body of `PATCH /recurring-rules/:id`. Applies to future occurrences only (spec §5.4.2). No
 * `type`/`startDate` (immutable, see {@link createRecurringRuleSchema}). The merged
 * frequency/dayOfMonth/dayOfWeek cross-check runs in the service layer, since this schema alone
 * does not know the rule's current (unchanged) frequency.
 */
export const updateRecurringRuleSchema = z
  .object({
    categoryId: z.number().int().positive().optional(),
    amount: moneyStringSchema.optional(),
    description: z.string().trim().max(DESCRIPTION_MAX_LENGTH, `Description must be at most ${DESCRIPTION_MAX_LENGTH} characters.`).nullable().optional(),
    frequency: z.enum(RecurringFrequency).optional(),
    intervalCount: z.number().int().min(1).max(RECURRING_INTERVAL_MAX).optional(),
    dayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
    dayOfWeek: z.number().int().min(1).max(7).nullable().optional(),
    endDate: localDateSchema.nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'At least one field must be provided.');
/** Inferred input type of {@link updateRecurringRuleSchema}. */
export type UpdateRecurringRuleInput = z.infer<typeof updateRecurringRuleSchema>;

/** Shape of a recurring rule as returned by the API (dates as `YYYY-MM-DD`, timestamps as ISO strings). */
export interface RecurringRuleDto {
  id: number;
  categoryId: number;
  category: { id: number; name: string; type: TransactionType; icon: string | null; color: string | null };
  type: TransactionType;
  amount: string;
  description: string | null;
  frequency: RecurringFrequency;
  intervalCount: number;
  dayOfMonth: number | null;
  dayOfWeek: number | null;
  startDate: string;
  endDate: string | null;
  nextRunDate: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
