/**
 * tips.ts
 * Zod schemas and DTO types for the rule-based savings-tips engine (docs/spec/05b §5.10, not
 * AI-dependent): `GET /tips`, `POST /tips/:id/pin|unpin|dismiss`. `id` is a string because the DB
 * primary key is a `BigInt` (matches `NotificationDto`'s own convention).
 * Main exports: tipIdParamSchema + inferred type, TipDto, TipListResponse
 * Spec: docs/spec/05b §5.10 · docs/spec/07 §7.3.3 (tips routes)
 */
import { z } from 'zod';
import type { TipRuleType, UserTipStatus } from '../enums.js';

/** Route param `{ id }` of `POST /tips/:id/pin|unpin|dismiss` — `user_tips.id` is a BigInt PK. */
export const tipIdParamSchema = z.object({ id: z.string().regex(/^\d{1,20}$/, 'Invalid id.') }).strict();
/** Inferred input type of {@link tipIdParamSchema}. */
export type TipIdParamInput = z.infer<typeof tipIdParamSchema>;

/** One ranked, rendered tip for the current period, as returned by the API. */
export interface TipDto {
  id: string;
  ruleType: TipRuleType;
  categoryId: number | null;
  categoryName: string | null;
  /** First day of the month this tip was computed for, `YYYY-MM-DD`. */
  period: string;
  title: string;
  body: string;
  /** Decimal string; estimated potential saving driving this tip's rank. */
  impactAmount: string;
  /** `impact x confidence x recency`, rounded to 4 decimals. */
  score: number;
  status: UserTipStatus;
  /** Local date the tip stops being hidden, when `status` is `dismissed`. */
  dismissedUntil: string | null;
  createdAt: string;
}

/** Response body of `GET /tips` — pinned first, then score descending (dismissed-within-30-days excluded). */
export interface TipListResponse {
  data: TipDto[];
}
