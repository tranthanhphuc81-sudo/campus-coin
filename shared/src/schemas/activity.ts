/**
 * activity.ts
 * Zod schema and DTO types for the recent-activity feature (docs/spec/05c §5.14): the backend
 * records a row every time a user views (`GET /transactions/:id`) or edits (`PATCH`) a
 * transaction, keeps only the newest {@link RECENT_ACTIVITY_MAX_PER_USER} rows per user, and
 * exposes them via `GET /activity/recent` for the dashboard "Recent" widget and the
 * transactions page's "Recently viewed" panel.
 * Main exports: recentActivityQuerySchema + inferred type, RecentActivityDto, RecentActivityListResponse
 * Spec: docs/spec/05c §5.14
 */
import { z } from 'zod';
import type { RecentActivityAction, TransactionType } from '../enums.js';
import { RECENT_ACTIVITY_DEFAULT_LIMIT, RECENT_ACTIVITY_MAX_PER_USER } from '../constants.js';

/** Query of `GET /activity/recent?limit=`. */
export const recentActivityQuerySchema = z
  .object({
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(RECENT_ACTIVITY_MAX_PER_USER)
      .default(RECENT_ACTIVITY_DEFAULT_LIMIT),
  })
  .strict();
/** Inferred input type of {@link recentActivityQuerySchema}. */
export type RecentActivityQuery = z.infer<typeof recentActivityQuerySchema>;

/** One recently viewed/edited transaction, joined with its (still non-deleted) transaction data. */
export interface RecentActivityDto {
  transactionId: string;
  action: RecentActivityAction;
  /** UTC instant the view/edit happened, ISO 8601. */
  occurredAt: string;
  description: string | null;
  amount: string;
  currency: string;
  type: TransactionType;
  /** Local date of the underlying transaction, `YYYY-MM-DD`. */
  txnDate: string;
  category: { id: number; name: string; icon: string; color: string };
}

/** Response body of `GET /activity/recent`. */
export interface RecentActivityListResponse {
  data: RecentActivityDto[];
}
