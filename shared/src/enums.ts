/**
 * enums.ts
 * Domain enumerations shared by backend and frontend. Values match the MySQL ENUM columns
 * in docs/spec/06 exactly (lower-case). Each enum is a frozen `as const` object plus a
 * matching union type, so it works with `z.enum(...)`, Prisma and plain TS narrowing.
 * Exports: TransactionType, TransactionSource, CategorySource, RecurringFrequency, Role,
 *          UserStatus, CurrencyCode, Locale, AcademicYear, Theme, NotificationType,
 *          AnnouncementLevel, ImportBatchStatus, ImportDateFormat, ImportCategoryOrigin,
 *          ImportRowFilter, InsightGenerator, InsightStatus, TipRuleType, UserTipStatus,
 *          BookmarkTargetType, RecentActivityAction
 * Spec: docs/spec/06 §6 (users, categories, transactions, recurring_transactions, notifications,
 *   announcements, import_batches, insights, tip_templates, user_tips, bookmarks, recent_activity)
 */

/** Direction of a money movement (transactions.type, categories.type). */
export const TransactionType = {
  INCOME: 'income',
  EXPENSE: 'expense',
} as const;
/** Union of {@link TransactionType} values. */
export type TransactionType = (typeof TransactionType)[keyof typeof TransactionType];

/** How a transaction was created (transactions.source). */
export const TransactionSource = {
  MANUAL: 'manual',
  RECURRING: 'recurring',
  CSV_IMPORT: 'csv_import',
} as const;
/** Union of {@link TransactionSource} values. */
export type TransactionSource = (typeof TransactionSource)[keyof typeof TransactionSource];

/** How a transaction's category was chosen – used to measure AI quality (transactions.category_source). */
export const CategorySource = {
  USER: 'user',
  AI_ACCEPTED: 'ai_accepted',
  AI_OVERRIDDEN: 'ai_overridden',
  RULE: 'rule',
  IMPORT: 'import',
} as const;
/** Union of {@link CategorySource} values. */
export type CategorySource = (typeof CategorySource)[keyof typeof CategorySource];

/** Repeat interval of a recurring transaction (recurring_transactions.frequency). */
export const RecurringFrequency = {
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  YEARLY: 'yearly',
} as const;
/** Union of {@link RecurringFrequency} values. */
export type RecurringFrequency = (typeof RecurringFrequency)[keyof typeof RecurringFrequency];

/** Account role (users.role); admins use the separate /admin portal with mandatory MFA. */
export const Role = {
  STUDENT: 'student',
  ADMIN: 'admin',
} as const;
/** Union of {@link Role} values. */
export type Role = (typeof Role)[keyof typeof Role];

/** Lifecycle state of a user account (users.status). */
export const UserStatus = {
  PENDING: 'pending',
  ACTIVE: 'active',
  DISABLED: 'disabled',
} as const;
/** Union of {@link UserStatus} values. */
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

/** Supported display currencies (default USD, VND supported). */
export const CurrencyCode = {
  USD: 'USD',
  VND: 'VND',
} as const;
/** Union of {@link CurrencyCode} values. */
export type CurrencyCode = (typeof CurrencyCode)[keyof typeof CurrencyCode];

/** Supported UI locales (only English for now; see CLAUDE.md golden rule 1). */
export const Locale = {
  EN: 'en',
} as const;
/** Union of {@link Locale} values. */
export type Locale = (typeof Locale)[keyof typeof Locale];

/** Student academic year (users.academic_year), shown in profile/onboarding. */
export const AcademicYear = {
  YEAR_1: 'year_1',
  YEAR_2: 'year_2',
  YEAR_3: 'year_3',
  YEAR_4: 'year_4',
  YEAR_5: 'year_5',
  POSTGRADUATE: 'postgraduate',
  OTHER: 'other',
} as const;
/** Union of {@link AcademicYear} values. */
export type AcademicYear = (typeof AcademicYear)[keyof typeof AcademicYear];

/** UI colour theme preference (users.preferences.theme). */
export const Theme = {
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system',
} as const;
/** Union of {@link Theme} values. */
export type Theme = (typeof Theme)[keyof typeof Theme];

/** Kind of in-app notification (notifications.type); drives icon/copy on the client. */
export const NotificationType = {
  BUDGET_NEAR: 'budget_near',
  BUDGET_EXCEEDED: 'budget_exceeded',
  INSIGHT_READY: 'insight_ready',
  ANOMALY: 'anomaly',
  DUPLICATE: 'duplicate',
  SYSTEM: 'system',
} as const;
/** Union of {@link NotificationType} values. */
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

/** Severity of a system announcement (announcements.level); drives banner colour. */
export const AnnouncementLevel = {
  INFO: 'info',
  WARNING: 'warning',
} as const;
/** Union of {@link AnnouncementLevel} values. */
export type AnnouncementLevel = (typeof AnnouncementLevel)[keyof typeof AnnouncementLevel];

/** Lifecycle state of a CSV import batch (import_batches.status). */
export const ImportBatchStatus = {
  UPLOADED: 'uploaded',
  PARSING: 'parsing',
  PREVIEWED: 'previewed',
  COMMITTED: 'committed',
  FAILED: 'failed',
  EXPIRED: 'expired',
} as const;
/** Union of {@link ImportBatchStatus} values. */
export type ImportBatchStatus = (typeof ImportBatchStatus)[keyof typeof ImportBatchStatus];

/** Date format a client picks to resolve ambiguous `date` cells in a CSV import (docs/spec/05a §5.5, Table 19). */
export const ImportDateFormat = {
  YMD: 'YYYY-MM-DD',
  DMY: 'DD/MM/YYYY',
  MDY: 'MM/DD/YYYY',
} as const;
/** Union of {@link ImportDateFormat} values. */
export type ImportDateFormat = (typeof ImportDateFormat)[keyof typeof ImportDateFormat];

/** How a CSV import row's category was resolved during parsing (not persisted — reused as `categorySource` at commit). */
export const ImportCategoryOrigin = {
  /** Matched the row's own `category` column against the user's visible categories. */
  CSV: 'csv',
  /** No usable `category` cell — an AI suggestion (P10 `suggestBatch`) was accepted. */
  AI: 'ai',
  /** No usable cell and no AI suggestion — fell back to Miscellaneous/Other Income, flagged `needsReview`. */
  FALLBACK: 'fallback',
  /** The user picked/changed the category in the Map & preview step. */
  USER: 'user',
} as const;
/** Union of {@link ImportCategoryOrigin} values. */
export type ImportCategoryOrigin = (typeof ImportCategoryOrigin)[keyof typeof ImportCategoryOrigin];

/** Row filter tab on the Map & preview step (`GET /imports/:id?filter=`). */
export const ImportRowFilter = {
  ALL: 'all',
  ERRORS: 'errors',
  DUPLICATES: 'duplicates',
  NEEDS_REVIEW: 'needs_review',
} as const;
/** Union of {@link ImportRowFilter} values. */
export type ImportRowFilter = (typeof ImportRowFilter)[keyof typeof ImportRowFilter];

/** Who produced an insight's text (insights.generator) — `template` whenever AI is off/fails/is rejected. */
export const InsightGenerator = {
  LLM: 'llm',
  TEMPLATE: 'template',
} as const;
/** Union of {@link InsightGenerator} values. */
export type InsightGenerator = (typeof InsightGenerator)[keyof typeof InsightGenerator];

/** Lifecycle of one monthly insight generation run (insights.status). */
export const InsightStatus = {
  QUEUED: 'queued',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;
/** Union of {@link InsightStatus} values. */
export type InsightStatus = (typeof InsightStatus)[keyof typeof InsightStatus];

/** Which savings-tip rule (docs/spec/05b Bảng 23) produced a tip_templates row (tip_templates.rule_type). */
export const TipRuleType = {
  OVER_BUDGET: 'over_budget',
  ABOVE_AVERAGE: 'above_average',
  SMALL_FREQUENT: 'small_frequent',
  SUBSCRIPTIONS: 'subscriptions',
  SAVINGS_GAP: 'savings_gap',
  WEEKEND_SPIKE: 'weekend_spike',
  GENERAL: 'general',
} as const;
/** Union of {@link TipRuleType} values. */
export type TipRuleType = (typeof TipRuleType)[keyof typeof TipRuleType];

/** Interaction state of a user's generated tip (user_tips.status). */
export const UserTipStatus = {
  ACTIVE: 'active',
  PINNED: 'pinned',
  DISMISSED: 'dismissed',
} as const;
/** Union of {@link UserTipStatus} values. */
export type UserTipStatus = (typeof UserTipStatus)[keyof typeof UserTipStatus];

/** Kind of object a user can bookmark (bookmarks.target_type), P14 §5.12. */
export const BookmarkTargetType = {
  TIP: 'tip',
  INSIGHT: 'insight',
  REPORT: 'report',
} as const;
/** Union of {@link BookmarkTargetType} values. */
export type BookmarkTargetType = (typeof BookmarkTargetType)[keyof typeof BookmarkTargetType];

/** How a transaction ended up in a user's recent activity list (recent_activity.action), P14 §5.14. */
export const RecentActivityAction = {
  VIEWED: 'viewed',
  EDITED: 'edited',
} as const;
/** Union of {@link RecentActivityAction} values. */
export type RecentActivityAction = (typeof RecentActivityAction)[keyof typeof RecentActivityAction];
