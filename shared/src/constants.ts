/**
 * constants.ts
 * Shared limits and defaults. Every "magic number" used by both apps lives here so the
 * frontend form validation and the backend Zod schemas can never drift apart.
 * Money limits are strings because money is never handled as a JS float (see CLAUDE.md).
 * Spec: docs/spec/05a (transaction rules) · docs/spec/07 (pagination) · docs/spec/06 (column sizes)
 */

import { CurrencyCode, Locale } from './enums.js';
import type { TransactionType } from './enums.js';

// ---- Money --------------------------------------------------------------------------------
/** Largest amount accepted for a single transaction/budget; fits DB column Decimal(14,2). */
export const AMOUNT_MAX = '999999999999.99';
/** Smallest positive amount accepted (amounts are always > 0; type gives the sign). */
export const AMOUNT_MIN = '0.01';
/** Decimal places stored for money values. */
export const MONEY_SCALE = 2;

// ---- Text lengths -------------------------------------------------------------------------
/** Max length of a transaction description / note. */
export const DESCRIPTION_MAX_LENGTH = 255;
/** Max length of a category name. */
export const CATEGORY_NAME_MAX_LENGTH = 50;
/** Max length of a user's full name (users.full_name). */
export const FULL_NAME_MAX_LENGTH = 100;
/** Max length of an email address (RFC 5321). */
export const EMAIL_MAX_LENGTH = 254;
/** Password length bounds (long upper bound allows passphrases, caps Argon2 cost abuse). BR-AU-02. */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

// ---- Pagination ---------------------------------------------------------------------------
/** Default page size for list endpoints. */
export const PAGE_SIZE_DEFAULT = 20;
/** Maximum page size a client may request. */
export const PAGE_SIZE_MAX = 100;
/** Maximum `page` number accepted by any paginated list endpoint (B-L8: an unbounded `page` turns
 * into a huge SQL OFFSET — slow query or an unmapped 500 instead of a clean 422). */
export const PAGE_NUMBER_MAX = 10_000;

// ---- Localisation defaults ----------------------------------------------------------------
export const DEFAULT_LOCALE: Locale = Locale.EN;
export const DEFAULT_CURRENCY: CurrencyCode = CurrencyCode.USD;
export const DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh';

// ---- Runtime / infrastructure -------------------------------------------------------------
/** Base path of the versioned REST API. */
export const API_BASE_PATH = '/api/v1';
/** Default HTTP port of the API when API_PORT is not set. */
export const DEFAULT_API_PORT = 3000;
/** Default port of the Vite dev server when WEB_PORT is not set (5173 is often taken). */
export const DEFAULT_WEB_PORT = 5174;
/** Max time the API/worker waits for in-flight work before a forced exit on shutdown. */
export const SHUTDOWN_TIMEOUT_MS = 10_000;

// ---- Authentication -------------------------------------------------------------------------
/** JWT `iss` claim; must match between the token issuer (P04) and `authenticate` (backend/src/middlewares). */
export const JWT_ISSUER = 'campuscoin';
/** JWT `aud` claim for student/admin access tokens. */
export const JWT_AUDIENCE = 'campuscoin-api';

// ---- Database -----------------------------------------------------------------------------
/** Queries slower than this are logged as warnings in development (backend/src/lib/prisma.ts). */
export const SLOW_QUERY_MS = 200;
/** owner_key value of system default categories (categories.owner_key = user_id ?? this). */
export const SYSTEM_OWNER_KEY = 'SYSTEM';

// ---- Authentication: token lifetimes (P04) -----------------------------------------------
// All *_MS/_MIN/_H constants below back JWT `exp`, cookie `maxAge` and Redis TTLs (P04 block B–D).
/** Student access token lifetime, in seconds (kept short; refresh token carries the session). */
export const ACCESS_TOKEN_TTL_SEC = 15 * 60;
/** Admin access token lifetime, in seconds — shorter than student (admin portal is higher-risk). */
export const ADMIN_ACCESS_TOKEN_TTL_SEC = 10 * 60;
/** Default refresh token lifetime, in milliseconds ("remember me" off). */
export const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Refresh token lifetime when the user checked "remember me", in milliseconds. */
export const REFRESH_TTL_REMEMBER_MS = 30 * 24 * 60 * 60 * 1000;
/** Admin refresh token absolute lifetime, in milliseconds (re-login required after this even if active). */
export const ADMIN_REFRESH_TTL_MS = 8 * 60 * 60 * 1000;
/** Admin session idle timeout, in milliseconds (no request for this long -> session ends). */
export const ADMIN_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
/** Email verification token lifetime, in milliseconds. */
export const VERIFY_EMAIL_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
/** Password reset token lifetime, in milliseconds. */
export const RESET_PASSWORD_TOKEN_TTL_MS = 30 * 60 * 1000;
/** MFA challenge token lifetime, in milliseconds (short-lived, single purpose). */
export const MFA_TOKEN_TTL_MS = 5 * 60 * 1000;

// ---- Authentication: lockout & MFA policy -------------------------------------------------
/** Consecutive failed logins allowed before the account is temporarily locked (BR-AU-04). */
export const LOGIN_MAX_FAILED_ATTEMPTS = 5;
/** Escalating lockout durations, in minutes, applied on repeated lockouts (BR-AU-04). */
export const LOCKOUT_DURATIONS_MIN: readonly number[] = [15, 30, 60];
/** Wrong MFA codes allowed within one `mfaToken` challenge before it is invalidated. */
export const MFA_MAX_ATTEMPTS = 5;
/** Number of one-time MFA recovery codes generated when a user enables TOTP. */
export const MFA_RECOVERY_CODE_COUNT = 10;
/** TTL of the Redis "shadow lockout" failed-attempt counter for an unknown email (P19 A-M3): long
 * enough to span the escalating {@link LOCKOUT_DURATIONS_MIN} windows, short enough that a one-off
 * enumeration probe doesn't grow Redis forever. */
export const SHADOW_LOCKOUT_COUNTER_TTL_SEC = 24 * 60 * 60;

// ---- Authentication: cookies & audiences --------------------------------------------------
/** Name of the HttpOnly refresh-token cookie. */
export const REFRESH_COOKIE_NAME = 'cc_rt';
/** `Path` attribute of the refresh-token cookie — scoped to the auth endpoints that need it. */
export const REFRESH_COOKIE_PATH = '/api/v1/auth';
/** JWT `aud` claim for the short-lived admin MFA challenge token (distinct from the API audience). */
export const JWT_MFA_AUDIENCE = 'campuscoin-admin-mfa';

// ---- Authentication: external checks ------------------------------------------------------
/** Timeout for the HaveIBeenPwned range lookup, in milliseconds (BR-AU-02: never block signup on it). */
export const HIBP_TIMEOUT_MS = 2000;

// ---- Categories (P07) -----------------------------------------------------------------------
/** Max number of personal categories per user, per type (BR-CA-04: anti-abuse). */
export const CATEGORY_PERSONAL_MAX = 50;
/** How long a user's category list stays cached in Redis, in seconds (docs/spec/10 §10.3). */
export const CATEGORIES_CACHE_TTL_SEC = 600;

// ---- Transactions (P07) ---------------------------------------------------------------------
/** Earliest transaction date accepted (BR-TX-02). */
export const TXN_DATE_MIN = '2000-01-01';
/** Furthest a transaction date may be in the future, in days (BR-TX-02: allows timezone drift). */
export const TXN_DATE_MAX_DAYS_AHEAD = 1;
/** Days a soft-deleted transaction stays recoverable in "Trash" before permanent cleanup (BR-TX-07). */
export const TRASH_RETENTION_DAYS = 30;
/** Max length of the free-text search query on the transaction list (BR-TX-08). */
export const TXN_SEARCH_MAX_LENGTH = 100;
/** Max number of comma-separated category ids accepted in a transaction list filter. */
export const CATEGORY_FILTER_MAX_IDS = 20;
/** Max length of a normalised merchant key (backend/src/lib/merchantKey.ts). */
export const MERCHANT_KEY_MAX_LENGTH = 100;

// ---- Recurring rules (P07) ------------------------------------------------------------------
/** Max personal recurring rules per user; not in spec, added for the same anti-abuse reason as
 * BR-CA-04, confirmed by the project owner. */
export const RECURRING_RULES_MAX = 50;
/** Max repeat interval (e.g. "every N months/weeks/years") accepted for a recurring rule. */
export const RECURRING_INTERVAL_MAX = 12;
/** Max number of missed occurrences the materialize job will backfill in one run per rule. */
export const RECURRING_CATCHUP_MAX = 12;

// ---- Budgets (P09) ----------------------------------------------------------------------------
/** Default consumption % at which a budget sends a "near limit" alert if the user doesn't customise it. */
export const BUDGET_ALERT_THRESHOLD_DEFAULT = 80;
/** Lowest consumption % a user may set as their own alert threshold. */
export const BUDGET_ALERT_THRESHOLD_MIN = 50;
/** Highest consumption % a user may set as their own alert threshold (100 = only alert on exceeding). */
export const BUDGET_ALERT_THRESHOLD_MAX = 100;
/** Dashboard "Budget vs Actual" widget colour thresholds (docs/spec/05b §5.7) — fixed, independent
 * of each budget's own customisable {@link BUDGET_ALERT_THRESHOLD_DEFAULT}. */
export const BUDGET_STATUS_AMBER_PCT = 80;
export const BUDGET_STATUS_RED_PCT = 100;
/** Max category budgets accepted in one `PUT /budgets` bulk upsert call. */
export const BUDGET_BULK_UPSERT_MAX = 200;
/** How many years before/after today a budget `month` may be set (B-M2: bounds the otherwise
 * unlimited number of budget rows a user could create — finite months × {@link BUDGET_BULK_UPSERT_MAX}
 * categories per month is a finite total instead of an open-ended one). */
export const BUDGET_MONTH_RANGE_YEARS = 5;

// ---- Notifications (P09) ----------------------------------------------------------------------
/** Lifetime of a one-time SSE connection ticket, in seconds (EventSource can't send an Authorization header). */
export const NOTIFICATION_STREAM_TICKET_TTL_SEC = 30;
/** SSE heartbeat interval, in seconds, to keep intermediary proxies from closing an idle connection. */
export const NOTIFICATION_STREAM_HEARTBEAT_SEC = 25;
/** Fallback poll interval for clients without an open SSE connection, in milliseconds. */
export const NOTIFICATION_POLL_INTERVAL_MS = 60_000;

// ---- Dashboard (P09) --------------------------------------------------------------------------
/** How long a user's dashboard summary stays cached in Redis, in seconds (docs/spec/10 §10.3). */
export const DASHBOARD_CACHE_TTL_SEC = 60;
/** Number of trailing months shown in the dashboard's income-vs-expense trend widget. */
export const DASHBOARD_TREND_MONTHS = 6;

// ---- Announcements (P09/P15) ------------------------------------------------------------------
/** How long the list of active system announcements stays cached in Redis, in seconds. */
export const ANNOUNCEMENTS_CACHE_TTL_SEC = 300;

// ---- AI (P10) -----------------------------------------------------------------------------
/** Debounce, in ms, the frontend waits after the description field stops changing before calling `/ai/categorize/suggest`. */
export const AI_SUGGEST_DEBOUNCE_MS = 400;
/** Minimum description length before a categorize-suggest call is worth making. */
export const AI_SUGGEST_MIN_CHARS = 2;
/** Tier-1 confidence once a personal rule has been reinforced `AI_RULE_STRONG_MIN_HITS` times or more. */
export const AI_CONFIDENCE_RULE_STRONG = '0.95';
/** Tier-1 confidence for a fresh (not yet reinforced) personal rule. */
export const AI_CONFIDENCE_RULE = '0.8';
/** Tier-2 confidence for a keyword-dictionary match. */
export const AI_CONFIDENCE_KEYWORD = '0.75';
/** Upper clamp applied to every LLM-reported confidence (D5: an LLM never outranks a real personal rule). */
export const AI_LLM_CONFIDENCE_MAX = 0.9;
/** Lower bound below which an LLM suggestion is dropped rather than surfaced (D5). */
export const AI_LLM_CONFIDENCE_MIN = 0.5;
/** hitCount at/above which a tier-1 rule's confidence becomes {@link AI_CONFIDENCE_RULE_STRONG}. */
export const AI_RULE_STRONG_MIN_HITS = 2;
/** Consecutive identical corrections that replace an existing rule outright (D4). */
export const AI_RULE_REPLACE_AFTER = 2;
/** How long a tier-3 (LLM) categorization result stays cached, in seconds. */
export const AI_CACHE_TTL_SEC = 7 * 24 * 3600;
/** How long a tier-3 "no suggestion" (negative) result stays cached, in seconds. */
export const AI_CACHE_NEGATIVE_TTL_SEC = 24 * 3600;
/** Max items sent to the LLM provider in a single batch categorize call. */
export const AI_BATCH_SIZE = 50;
/** Timeout for a batch categorize call (D7: longer than the interactive single-suggest timeout). */
export const AI_BATCH_TIMEOUT_MS = 15_000;
/** Max characters of a description sent to the LLM, after sanitisation/truncation. */
export const AI_LLM_TEXT_MAX_CHARS = 100;
/** Max output tokens requested from the LLM provider per call. */
export const AI_LLM_MAX_OUTPUT_TOKENS = 2048;
/** Consecutive provider failures before the circuit breaker opens. */
export const AI_CIRCUIT_FAILURE_THRESHOLD = 5;
/** How long the circuit breaker stays open before a half-open trial call, in ms. */
export const AI_CIRCUIT_OPEN_MS = 60_000;
/** TTL of the idempotency guard that stops a transaction event from double-counting an AI-learning update, in seconds. */
export const AI_LEARNED_DEDUPE_TTL_SEC = 86_400;

// ---- Reports (P12) --------------------------------------------------------------------------
/** How long a report covering the current (still-open) period stays cached, in seconds (docs/spec/10 §10.3). */
export const REPORT_CURRENT_PERIOD_CACHE_TTL_SEC = 60;
/** How long a report covering only already-ended periods stays cached, in seconds (docs/spec/10 §10.3). */
export const REPORT_ENDED_PERIOD_CACHE_TTL_SEC = 3600;
/** Default trailing months for `GET /reports/income-vs-expense` when `months` is omitted. */
export const REPORT_INCOME_VS_EXPENSE_MONTHS_DEFAULT = 6;
/** Max trailing months accepted by `GET /reports/income-vs-expense`. */
export const REPORT_INCOME_VS_EXPENSE_MONTHS_MAX = 24;
/** Max length of the optional personal message on `POST /reports/monthly/share`. */
export const REPORT_SHARE_MESSAGE_MAX_CHARS = 500;
/** Number of top transactions (by amount) listed in the monthly PDF export. */
export const REPORT_TOP_TRANSACTIONS_LIMIT = 10;

// ---- CSV import (P11) ----------------------------------------------------------------------
/** Max upload size for a CSV import file, in bytes (docs/spec/09 §9.10). */
export const IMPORT_MAX_FILE_BYTES = 2 * 1024 * 1024;
/** Max data rows accepted in one CSV import (excludes the header row). */
export const IMPORT_MAX_ROWS = 5000;
/** Max columns accepted in one CSV import. */
export const IMPORT_MAX_COLUMNS = 50;
/** Max characters accepted in a single CSV cell. */
export const IMPORT_MAX_CELL_CHARS = 1000;
/** MIME types accepted for a CSV upload (charset parameter is ignored when checking). */
export const IMPORT_ALLOWED_MIME_TYPES = ['text/csv', 'text/plain'] as const;
/** Canonical CSV import columns, in the order documented in docs/spec/05a Table 19. */
export const IMPORT_CSV_COLUMNS = ['date', 'amount', 'type', 'description', 'category'] as const;
/** How long a parsed import preview stays in Redis, in seconds (docs/spec/05a §5.5: 24 hours). */
export const IMPORT_PREVIEW_TTL_SEC = 24 * 3600;
/** Frontend poll interval while an import batch is `uploaded`/`parsing`, in milliseconds. */
export const IMPORT_POLL_INTERVAL_MS = 1000;
/** Frontend gives up polling and shows a "still processing" message after this long, in milliseconds. */
export const IMPORT_POLL_MAX_MS = 300_000;
/** Max rows accepted in one `PATCH /imports/:id/rows` call. */
export const IMPORT_ROWS_PATCH_MAX = 200;
/** Rows written per `createMany`/history-insert batch during `POST /imports/:id/commit`. */
export const IMPORT_COMMIT_CHUNK_SIZE = 500;
/** Max time the commit's DB transaction is allowed to run, in milliseconds (large batches, chunked writes). */
export const IMPORT_COMMIT_TX_TIMEOUT_MS = 60_000;
/** Rate limit for `POST /imports` (docs/spec/07 §7.4, Table 46). */
export const IMPORT_UPLOAD_RATE_LIMIT_PER_HOUR = 10;
/** Max batches a user may have open (`uploaded`/`parsing`/`previewed` — not yet committed/discarded)
 * at once (B-M3: each open batch holds raw text + a preview in Redis for 24h; without a cap the
 * upload rate limit alone still lets one account pile up ~240 batches worth of Redis memory). */
export const IMPORT_OPEN_BATCHES_MAX = 3;
/** Fallback category name tried when a row has no usable `category` cell and AI could not suggest one. */
export const IMPORT_FALLBACK_CATEGORY_NAME: Record<TransactionType, string> = {
  expense: 'Miscellaneous',
  income: 'Other Income',
};

// ---- Insights (P13) -------------------------------------------------------------------------
/** Minimum transactions (any type) a user must have in the analysed month to get a generated insight (§5.9). */
export const INSIGHT_MIN_TRANSACTIONS = 5;
/** Max user-triggered "Regenerate" calls per insight row; matches the DB CHECK on `insights.regenerate_count`. */
export const INSIGHT_MAX_REGENERATE_PER_MONTH = 3;
/** Trailing months averaged into avg3(c); at least 2 of these must have data (§5.9.1). */
export const INSIGHT_AVG_MONTHS = 3;
/** Minimum non-null trailing months required before avg3(c)/a growth flag is meaningful (§5.9.1). */
export const INSIGHT_AVG_MIN_MONTHS = 2;
/** Growth ratio `(cur-avg3)/avg3` at/above which a category growth flag is considered (§5.9.1). */
export const INSIGHT_GROWTH_FLAG_RATIO = 0.25;
/** The growth flag also requires `|cur-avg3|` to be at least this % of the user's `monthlyAllowanceBaseline` (§5.9.1). */
export const INSIGHT_GROWTH_ALLOWANCE_PCT = 5;
/** Flat floor for the growth flag's absolute-deviation test (`max(floor, allowancePct%)`), per currency — no
 * single flat number is meaningful across a 0-decimal and a 2-decimal currency (§5.9.1). */
export const INSIGHT_GROWTH_ABS_FLOOR: Record<CurrencyCode, string> = {
  [CurrencyCode.USD]: '5',
  [CurrencyCode.VND]: '50000',
};
/** Divisor turning a monthly average into a suggested weekly spending cap (§5.9.1: avg3 / 4.33, rounded). */
export const INSIGHT_WEEKLY_CAP_DIVISOR = 4.33;
/** Max flagged patterns (by absolute deviation) surfaced in one insight (§5.9.1 step 4). */
export const INSIGHT_MAX_FLAGGED_PATTERNS = 3;
/** Soft word budget given to the LLM for `summary_text`+`tip_text` combined (§5.9.2 prompt constraint). */
export const INSIGHT_OUTPUT_MAX_WORDS = 120;
/** Hard character cap enforced on the LLM's raw `summary_text`+`tip_text` output (generous over
 * {@link INSIGHT_OUTPUT_MAX_WORDS} to tolerate normal word-length variance; only pathological output is rejected). */
export const INSIGHT_OUTPUT_MAX_CHARS = 1100;
/** Sampling temperature for the insight-writing LLM call (§5.9.2: low, for consistent/factual prose). */
export const INSIGHT_LLM_TEMPERATURE = 0.3;
/** Timeout for the insight-writing LLM call, in milliseconds (a single call per user, not a batch). */
export const INSIGHT_LLM_TIMEOUT_MS = 3000;

// ---- Recent activity (P14) -------------------------------------------------------------------
/** Rows kept per user in `recent_activity`; the oldest row is dropped once this is exceeded. */
export const RECENT_ACTIVITY_MAX_PER_USER = 20;
/** Default `limit` for `GET /activity/recent` when not given by the caller. */
export const RECENT_ACTIVITY_DEFAULT_LIMIT = 10;
/** Items shown in the dashboard "Recent" widget. */
export const DASHBOARD_RECENT_ACTIVITY_N = 5;

// ---- Anomaly detection (P14) -----------------------------------------------------------------
/** Trailing window, in days, a category's transactions are sampled from for anomaly stats (§5.14). */
export const ANOMALY_WINDOW_DAYS = 90;
/** Minimum transactions in the window before a category's mean/median/stdDev are trusted (§5.14). */
export const ANOMALY_MIN_SAMPLE = 5;
/** An amount above `mean + N * stdDev` is a candidate anomaly (§5.14). */
export const ANOMALY_SIGMA_MULTIPLIER = 3;
/** An amount above `N * median` is a candidate anomaly (§5.14, OR'd with the sigma test). */
export const ANOMALY_MEDIAN_MULTIPLIER = 3;
/** A candidate anomaly must also exceed this % of `monthlyAllowanceBaseline` (when set) to fire (§5.14). */
export const ANOMALY_ALLOWANCE_SHARE_PCT = 20;
/** Max transactions sampled per category when computing anomaly stats (perf guard, not in spec). */
export const ANOMALY_PEER_SAMPLE_MAX = 500;

// ---- Duplicate detection (P14) ---------------------------------------------------------------
/** Max Levenshtein distance between two merchant keys still considered "the same merchant" (§5.14). */
export const DUPLICATE_MAX_EDIT_DISTANCE = 2;
/** Max days apart two transactions' `txnDate` may be and still be considered a possible duplicate (§5.14). */
export const DUPLICATE_DATE_WINDOW_DAYS = 1;
/** Max minutes apart two transactions' `createdAt` may be and still be considered a possible duplicate (§5.14). */
export const DUPLICATE_CREATED_WINDOW_MINUTES = 10;
/** Max same-user candidate transactions scanned when looking for a duplicate match (perf guard). */
export const DUPLICATE_CANDIDATES_MAX = 20;

// ---- Forecast (P14) -------------------------------------------------------------------------
/** Weighted-moving-average weights, index 0 = M-1 (most recent) .. index 2 = M-3 (oldest); strings
 * so the Decimal math in `lib/forecast.ts` stays exact (§5.14: 0.5 / 0.3 / 0.2). */
export const FORECAST_WEIGHTS = ['0.5', '0.3', '0.2'] as const;
/** Trailing months used as the WMA basis for next month's forecast. */
export const FORECAST_BASIS_MONTHS = 3;
/** Minimum non-null basis months required before a forecast is computed (§5.14: else `insufficientData`). */
export const FORECAST_MIN_DATA_MONTHS = 2;

// ---- Bookmarks (P14) ------------------------------------------------------------------------
/** Max length of a bookmark's free-text note. */
export const BOOKMARK_NOTE_MAX_CHARS = 500;
/** Max length of `bookmarks.target_ref`. Widened from the DB's original 64 chars — a migration to
 * `VARCHAR(255)` lands in a later P14 stage; this constant already reflects the new size so the
 * Zod schema and the eventual column stay in sync. */
export const BOOKMARK_TARGET_REF_MAX = 255;
/** Max bookmarks per user (anti-abuse, matches the spirit of {@link CATEGORY_PERSONAL_MAX}). */
export const BOOKMARKS_MAX_PER_USER = 100;
/** Max length of the free-text search query on `GET /bookmarks?q=`. */
export const BOOKMARK_SEARCH_MAX_CHARS = 100;

// ---- Savings tips engine (P13) --------------------------------------------------------------
/** Days a dismissed tip (same rule + category) stays hidden before it can reappear (§5.10). */
export const TIP_DISMISS_DAYS = 30;
/** Debounce window for `tips.refresh` after a transaction event, per user (queues.ts's BullMQ `deduplication`). */
export const TIPS_REFRESH_DEBOUNCE_MS = 5 * 60 * 1000;
/** Tip-score confidence by months of history available (1/2/≥3 months) — mirrors AI_CONFIDENCE_* string style. */
export const TIP_CONFIDENCE_1_MONTH = '0.5';
export const TIP_CONFIDENCE_2_MONTHS = '0.75';
export const TIP_CONFIDENCE_3_PLUS_MONTHS = '1.0';
/** Recency multiplier floor a still-undismissed, uninteracted tip decays toward over time (§5.10). */
export const TIP_RECENCY_FLOOR = 0.5;
/** Days over which a tip's recency multiplier linearly decays from 1.0 to {@link TIP_RECENCY_FLOOR}. */
export const TIP_RECENCY_DECAY_DAYS = 14;
/** Number of top-ranked tips shown on the dashboard widget (§5.7 Bảng 21). */
export const TIPS_DASHBOARD_TOP_N = 3;
/** Calendar day of the month from which projected(c) is trusted enough to drive R1/R2 (§5.10: avoids early-month noise). */
export const TIP_PROJECTION_MIN_DAY = 5;
/** R1 over-budget-risk: no extra constant — impact = projected(c) - limit(c) whenever positive. */
/** R2 above-average: projected(c) must exceed avg3(c) by at least this multiple to fire. */
export const TIP_ABOVE_AVERAGE_MULTIPLIER = '1.2';
/** R3 small-frequent: minimum matching transactions in the trailing window to fire. */
export const TIP_SMALL_TXN_MIN_COUNT = 8;
/** R3 small-frequent: trailing window size, in days. */
export const TIP_SMALL_TXN_WINDOW_DAYS = 7;
/** R3 small-frequent: a transaction counts as "small" when it is below this % of `monthlyAllowanceBaseline`. */
export const TIP_SMALL_TXN_ALLOWANCE_PCT = 5;
/** R3 small-frequent: estimated recoverable share of the small transactions' total. */
export const TIP_SMALL_TXN_IMPACT_SHARE = '0.5';
/** R4 multiple-subscriptions: minimum active recurring Subscriptions rules to fire. */
export const TIP_SUBSCRIPTIONS_MIN_COUNT = 3;
/** R4 multiple-subscriptions: category name matched case-insensitively (no dedicated "is subscription" flag exists). */
export const TIP_SUBSCRIPTIONS_CATEGORY_NAME = 'Subscriptions';
/** R6 weekend-spike: trailing full weeks averaged into the "normal weekday spend" baseline. */
export const TIP_WEEKEND_LOOKBACK_WEEKS = 4;
/** R6 weekend-spike: `weekendTotal > multiplier × avgWeekdaySpend` fires the rule (§5.10's
 * "1.5 × avg weekday × 2" simplifies to weekend-total vs. 3× one weekday's average). */
export const TIP_WEEKEND_SPIKE_MULTIPLIER = 3;
/** R0 general: fixed score (not impact × confidence × recency) so an admin-authored general tip
 * always ranks below any real rule-based tip, which realistically has a larger impact. */
export const TIP_GENERAL_FIXED_SCORE = '0.1';

// ---- Admin portal (P15) ---------------------------------------------------------------------
/** Minimum distinct users a default category's usage must have before it is shown in admin stats
 * (k-anonymity, docs/spec/05c Table 24: never reveal usage for a group small enough to identify). */
export const ADMIN_K_ANONYMITY_MIN = 5;
/** Trailing window, in days, used for admin dashboard growth/MAU metrics. */
export const ADMIN_GROWTH_WINDOW_DAYS = 30;
/** Max length of an announcement title/body; matches `announcements.title`/`.body` `@db.VarChar` sizes. */
export const ANNOUNCEMENT_TITLE_MAX_LENGTH = 150;
export const ANNOUNCEMENT_BODY_MAX_LENGTH = 1000;
/** Max length of a tip template's code/title/body; matches `tip_templates` column sizes. */
export const TIP_TEMPLATE_CODE_MAX_LENGTH = 40;
export const TIP_TEMPLATE_TITLE_MAX_LENGTH = 150;
export const TIP_TEMPLATE_BODY_MAX_LENGTH = 500;

// ---- Privacy & data lifecycle (P16) -----------------------------------------------------------
/** Days a `DELETE /me` request stays reversible (admin "enable" can still cancel it) before the
 * cleanup job hard-deletes the account (docs/spec/09 §9.14). */
export const ACCOUNT_DELETION_GRACE_DAYS = 30;
/** Days an expired auth/refresh token is kept before the cleanup job deletes it (forensics window). */
export const EXPIRED_TOKEN_RETENTION_DAYS = 7;
/** Months an audit log row stays in `audit_logs` before the cleanup job archives it to disk. */
export const AUDIT_LOG_RETENTION_MONTHS = 12;
/** Max `GET /me/export` calls a user may make per day (Table 46). */
export const DATA_EXPORT_MAX_PER_DAY = 3;
/** Rows processed per batch by the `cleanup.expired` job's scan/update loops (perf guard). */
export const CLEANUP_BATCH_SIZE = 500;
/** Rows read per page when archiving old audit log rows to disk. */
export const AUDIT_ARCHIVE_BATCH_SIZE = 5000;
/** Exact phrase `DELETE /me` requires in its `confirm` field (extra guard against an accidental call). */
export const DELETE_ACCOUNT_CONFIRM_PHRASE = 'DELETE';
