# ADR-ADMIN-01: Admin Scope, Access Boundaries, and Privacy Rules

- **Status:** Accepted
- **Date:** 2026-09-27
- **Decision Maker:** Entire Development Team (All Members)
- **Draft Prompt:** p14-2a-admin-decide, GitHub Copilot (Claude Sonnet 5)

## Context

This ADR records the admin portal scope implemented in P15. The current source documents are `docs/spec/05c-budgets-bookmarks-admin-advanced-a11y.md`, `docs/spec/07-api.md`, and `docs/spec/09-security.md`. The decisions below describe shipped behavior, including places where the original draft was broader than the implementation.

## Decisions

### 1. Student user data visible to admins

The admin user-management endpoints target student accounts only. The repository applies `role = student` to list, detail, and status-update queries; admin accounts are not targetable through `/admin/users`.

The list response contains `id`, `fullName`, `maskedEmail`, `status`, and `createdAt`.

The detail response contains `id`, `fullName`, the full `email`, `status`, `createdAt`, `lastLoginAt`, and `transactionCount` (count of non-deleted transactions). It does not return transaction content or other financial data.

The list masks only the email local part. The current rule keeps one character for local parts of length three or less, otherwise two, then appends `***`; the domain is unchanged. Search matches the stored email server-side. The detail endpoint intentionally returns the full email.

Never return transaction lists or amounts/descriptions, balances, budgets, insights, recurring rules, personal categories, or profile allowance/savings values.

### 2. Admin statistics and privacy threshold

The shipped overview defines DAU as users whose `lastLoginAt` is within the last 24 hours and MAU as users whose `lastLoginAt` is within the last 30 days. These are rolling windows queried from `users`, not historical counts from `audit_logs`; the current queries do not filter by role or status. This is the implementation's operational definition and differs from the original draft's proposed audit-log source.

Category usage reports include system-default categories only. A row is omitted when fewer than five distinct user IDs have non-deleted transactions in that category. Omitted groups are not merged into `other`. The threshold is applied in the service before response serialization.

The implementation does not currently suppress DAU/MAU when the active student population is below five. Do not describe the current overview as applying that k-anonymity rule.

### 3. Student account disable and re-enable semantics

Disabling a student invalidates refresh sessions and outstanding email-verification/password-reset tokens, sets `status = disabled`, then revokes sessions again to close a login race. The action is audit-logged. Authentication checks account status and `deletedAt` after token verification, so a disabled/deleted account cannot continue using authenticated APIs with an otherwise valid access token.

`/enable` accepts only a disabled student. It restores `active` when the account is email-verified, otherwise `pending`; it also clears `deletedAt`, which cancels a pending self-deletion. Because these endpoints only manage students, admins cannot use them to disable themselves or the last admin. There are no separate self-disable/last-admin checks in this student-management flow.

### 4. Default category lifecycle

Admins manage system-default categories. A category can be hard-deleted only when it has no usage in transactions, recurring rules, budgets, or learned AI category rules. Otherwise deletion returns `409`; `?archive=true` sets it inactive. Imported, committed transactions are covered by the transaction check. The schema does not model `import_rows` as a persistent category reference.

Category names are stored on the category and transactions refer to its ID, so a rename changes the name shown for linked historical transactions. The current audit event records the actor, action, entity type, and entity ID; it does not store before/after category names.

### 5. Tip-template and announcement content

Content is stored and displayed as plain text; the app does not render HTML or Markdown. Announcement title/body and tip-template fields reject angle brackets. Tip templates support `{category}`, `{amount}`, and `{percent}` substitution; only these recognized placeholders are rendered, while other brace expressions remain literal. `POST /admin/tip-templates/preview` renders an unsaved tip-template preview. There is no announcement preview endpoint.

### 6. Mandatory admin audit events

### 6. Admin audit events

Mutating admin actions are recorded with actor context: user disable/enable/reset-link, category create/update/delete/archive, tip-template create/update/delete, announcement create/update/delete, and relevant admin authentication/MFA events. Read-only user, statistics, and audit-log queries are not audited by this policy. Audit recording is best-effort through the shared audit service.

## Implementation Status

The P15 admin portal and its supporting schema, middleware checks, user projection, email masking, category-usage threshold, tip-template preview, and write-action audit events are implemented. The actual scope and exceptions are stated in the decisions above: DAU/MAU use `lastLoginAt`, the threshold applies to category usage only, detail shows the full email, and preview is available for tip templates only. Self-disable/last-admin guards are not applicable to the student-only user-management endpoints. Category audit records do not currently include before/after names.

## Team Edits vs AI Draft

- The implementation revokes refresh sessions and outstanding auth tokens, changes the student account status, and revokes sessions again to close the concurrent-login window.
- **Concrete example:** A disabled student cannot continue calling authenticated APIs with a previously issued access token because authentication re-checks account status in the database.
