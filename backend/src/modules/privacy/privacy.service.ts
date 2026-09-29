/**
 * privacy.service.ts
 * Business logic for `GET /me/export` and `DELETE /me` (docs/spec/09 §9.14). Account deletion
 * flips `status`/`deletedAt` FIRST (security-fix follow-up, Fix 2: this immediately blocks new
 * logins/refreshes via the existing status gate — the more valuable side of the race to close
 * first), THEN revokes every session and outstanding verify/reset token — every step here is
 * naturally idempotent (`privacyRepository.requestDeletion` only touches rows still
 * `deletedAt: null`; revoking an already-revoked session/token is a no-op), so a crash mid-flight
 * is always safely retryable, same guarantee as `admin-users.service.ts`'s `disable()`.
 * Main exports: exportData, requestAccountDeletion, ExportResult
 * Spec: docs/spec/09 §9.14 (data portability, right to erasure)
 */
import { ACCOUNT_DELETION_GRACE_DAYS } from '@campuscoin/shared';
import { AuthTokenPurpose } from '../../generated/prisma/enums.js';
import { config } from '../../config/env.js';
import { emailTemplates } from '../../i18n/en.js';
import { queueEmail } from '../../integrations/mailer/index.js';
import { logger } from '../../lib/logger.js';
import { verifyPassword } from '../../lib/password.js';
import { accountLocked, notFound, validationFailed } from '../../lib/problem.js';
import { recordFailedAttempt } from '../auth/auth.service.js';
import { authRepository } from '../auth/auth.repository.js';
import { record } from '../audit/audit.service.js';
import { revokeAllSessions, type SessionContext } from '../sessions/session.service.js';
import { usersRepository } from '../users/users.repository.js';
import { buildJsonExport, buildTransactionsCsv, type ExportDocument } from './privacy.export.js';
import { privacyRepository } from './privacy.repository.js';

/** Result of {@link exportData}: either the JSON document, or a pre-built transactions CSV to zip. */
export type ExportResult = { format: 'json'; document: ExportDocument } | { format: 'csv'; csv: string };

/**
 * `GET /me/export`: builds the export in the requested format and writes the `user.export` audit
 * row. AI/mailer-style "never blocks the primary action" does not apply here — this IS the
 * primary action — so any failure building the export simply propagates as a 500 (or 404, see below).
 * @throws {AppError} 404 when the account no longer exists.
 */
export async function exportData(userId: string, format: 'json' | 'csv', ctx: SessionContext = {}): Promise<ExportResult> {
  const document = await buildJsonExport(userId);
  const result: ExportResult = format === 'csv' ? { format: 'csv', csv: buildTransactionsCsv(document.transactions) } : { format: 'json', document };

  await record({ action: 'user.export', actorId: userId, ip: ctx.ip, userAgent: ctx.userAgent, metadata: { format } });
  return result;
}

/** Formats a `Date` as a human-readable label for the deletion email, e.g. "October 28, 2026". */
function formatPurgeDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(date);
}

/**
 * `DELETE /me`: verifies the caller's password (re-authentication for a destructive action, gated
 * by the same lockout counter as a wrong login password), then — in order — disables the account
 * and stamps `deletedAt`, revokes every session and outstanding verify/reset token, writes the
 * `user.delete.requested` audit row, and (best-effort) emails the account holder. The account is
 * hard-deleted by the `cleanup.expired` job {@link ACCOUNT_DELETION_GRACE_DAYS} days later unless
 * an admin re-enables it first (`admin-users.service.ts`'s `enable()` clears `deletedAt`).
 * @throws {AppError} 404 when the account no longer exists; 422 validation-failed on field
 *   `password` when the password is wrong; 429 account-locked once too many wrong guesses have
 *   tripped the shared lockout counter.
 */
export async function requestAccountDeletion(userId: string, password: string, ctx: SessionContext = {}): Promise<{ scheduledPurgeAt: Date }> {
  const user = await usersRepository.findById(userId);
  if (!user) throw notFound('Account not found.');

  // Same lockout-before-verify ordering as `users.service.ts`'s `changePassword` (security review
  // 5): a wrong password here is itself a password guess against this account.
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    const retryAfterSeconds = Math.max(1, Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000));
    throw accountLocked(retryAfterSeconds, 'Too many failed attempts. Please try again later.');
  }

  const passwordOk = await verifyPassword(user.passwordHash, password);
  if (!passwordOk) {
    await recordFailedAttempt(user, ctx, 'delete_account');
    throw validationFailed([{ field: 'password', message: 'Password is incorrect.' }]);
  }

  const now = new Date();

  // Fix #2 (Low, security review): flip `status`/`deletedAt` FIRST — this closes the more valuable
  // side of the race immediately (a login/refresh completing between this write and the revoke
  // below is already blocked by the existing status gate), THEN revoke sessions + invalidate
  // tokens. Both directions stay idempotent/safe to retry: `requestDeletion` only touches a row
  // still `deletedAt: null`, and revoking an already-revoked session/token is a no-op.
  await privacyRepository.requestDeletion(userId, now);
  await Promise.all([
    revokeAllSessions(userId),
    authRepository.invalidateUnusedTokens(userId, AuthTokenPurpose.verify_email, now),
    authRepository.invalidateUnusedTokens(userId, AuthTokenPurpose.reset_password, now),
  ]);

  const purgeAfter = new Date(now.getTime() + ACCOUNT_DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000);

  // Fix #1 (Medium, security review): write the audit row right after the irreversible disable
  // write succeeds and BEFORE touching email — a `queueEmail` failure (e.g. Redis down) must never
  // cost this irreversible action its audit trail. `record()` itself never throws (see
  // `audit.service.ts`).
  await record({
    action: 'user.delete.requested',
    actorId: userId,
    entityType: 'user',
    entityId: userId,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    metadata: { purgeAfter: purgeAfter.toISOString() },
  });

  // Fix #1 (Medium): best-effort only — same try/catch-and-log-warn shape already used elsewhere in
  // this codebase for a non-critical queued side effect (e.g. `cleanup.service.ts`'s Redis
  // best-effort cleanups); the caller must still get its 202 even when Redis/BullMQ is down.
  // Fix #3 (Low): jobId is suffixed with `now.getTime()` (no bare ':', see PROGRESS.md's BullMQ
  // jobId gotcha) so an admin-cancelled deletion (`enable()` clears `deletedAt`) followed by a later
  // re-delete never collides with the first, already-completed job under the same fixed id.
  try {
    await queueEmail({
      to: user.email,
      jobId: `account-delete-${userId}-${now.getTime()}`,
      ...emailTemplates.accountDeletionRequested(user.fullName, formatPurgeDate(purgeAfter), config.mail.supportEmail),
    });
  } catch (err) {
    logger.warn({ err, userId }, '[privacy] failed to queue account-deletion email (best-effort)');
  }

  return { scheduledPurgeAt: purgeAfter };
}
