/**
 * adminStats.ts
 * DTOs for the admin portal's read-only aggregate stats endpoints (`GET /admin/stats/overview`,
 * `GET /admin/stats/categories-usage`). No Zod schema here — both endpoints take no body/query.
 * Main exports: AdminStatsOverviewDto, AdminCategoryUsageDto
 * Spec: docs/spec/05c §5.13 (Table 24) · docs/spec/07 §7.3.4
 */
import type { TransactionType } from '../enums.js';

/** Shape of `GET /admin/stats/overview`. */
export interface AdminStatsOverviewDto {
  /** Distinct users with a login in the last 24 hours. */
  dau: number;
  /** Distinct users with a login in the last `ADMIN_GROWTH_WINDOW_DAYS` days. */
  mau: number;
  usersByStatus: { pending: number; active: number; disabled: number };
  /** Non-deleted transactions, across every user. */
  totalTransactions: number;
  /** Users created in the last `ADMIN_GROWTH_WINDOW_DAYS` days. */
  newUsers30d: number;
  /** % change of `newUsers30d` vs. the same-length prior window; `null` when the prior window has 0 users. */
  growthPct30d: number | null;
  /** `accepted / (accepted + overridden)` among AI-categorized transactions, 0-1, 4dp; `null` when there are none. */
  aiAcceptanceRate: number | null;
  /** Completed monthly insight generations, across every user. */
  insightsGenerated: number;
}

/** One row of `GET /admin/stats/categories-usage` (default categories only; k-anonymity applied). */
export interface AdminCategoryUsageDto {
  categoryId: number;
  categoryName: string;
  type: TransactionType;
  transactionCount: number;
  userCount: number;
}
