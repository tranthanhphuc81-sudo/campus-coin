/**
 * audit.actions.ts
 * Single source of truth for every audit-log `action` code (docs/spec/09 §9.12 Table 58). Every
 * call site of `audit.service.record()` must use one of these — `audit.service.ts`'s
 * `AuditAction.action` is typed `AuditActionCode`, so a typo'd/new action string fails to compile
 * instead of silently writing an un-queryable action into `audit_logs`.
 * Main exports: AUDIT_ACTIONS, AuditActionCode
 * Spec: docs/spec/09 §9.12 (Table 58)
 */

/**
 * Every action code the backend can write to `audit_logs`. Grouped by area, in the order Table 58
 * documents them; new phases append to the end of their group.
 */
export const AUDIT_ACTIONS = [
  // ---- Registration / profile --------------------------------------------------------------
  'user.register',
  'user.email.verified',
  'user.profile.updated',
  // ---- Authentication -------------------------------------------------------------------------
  'auth.password.changed',
  'auth.password.reset',
  'auth.password.reset_requested',
  'auth.session.revoked',
  'auth.locked',
  'auth.login.success',
  'auth.login.failed',
  'auth.logout',
  'auth.logout_all',
  'auth.refresh.reuse_detected',
  // ---- Admin authentication ---------------------------------------------------------------------
  'admin.login',
  'admin.mfa.failed',
  'admin.mfa.enrolled',
  'admin.mfa.recovery_used',
  // ---- Admin user management --------------------------------------------------------------------
  'admin.user.disable',
  'admin.user.enable',
  'admin.user.send_reset_link',
  // ---- Admin content management ------------------------------------------------------------------
  'admin.category.create',
  'admin.category.update',
  'admin.category.archive',
  'admin.category.delete',
  'admin.template.create',
  'admin.template.update',
  'admin.template.delete',
  'admin.announcement.create',
  'admin.announcement.update',
  'admin.announcement.delete',
  // ---- Reports / imports ---------------------------------------------------------------------
  'report.shared',
  'import.committed',
  // ---- Privacy & data lifecycle (P16) -------------------------------------------------------
  'user.export',
  'user.delete.requested',
  'user.delete.completed',
  /** System sweep only (no per-user actor) — emitted by `cleanup.service.ts`'s trash-purge and account-purge steps. */
  'transaction.bulk_delete',
  /** Final-attempt job failures only (see `jobs/jobFailed.ts`). */
  'job.failed',
  /** Emitted by `ResilientProvider`'s `onError` hook (fire-and-forget, never blocks the AI call path). */
  'ai.provider.error',
  // TODO(p20): emitted by the backup script (infra/backup), not yet implemented in this codebase.
  'backup.failed',
] as const;

/** Union of every valid `audit_logs.action` value. */
export type AuditActionCode = (typeof AUDIT_ACTIONS)[number];
