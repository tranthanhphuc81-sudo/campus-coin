/**
 * admin-users.service.ts
 * Business logic for the admin portal's user list/search/detail and account status changes
 * (disable/enable/send-reset). BR-AU-08: disabling an account must kill every live session and
 * outstanding verify/reset link, not just flip the `status` flag — otherwise an already-issued
 * access token or a still-valid magic link would keep working after the admin "disabled" the
 * account. `sendResetLink` reuses `authService.forgotPassword` outright (BR-AU-03: it already
 * silently no-ops for a non-ACTIVE user) rather than reimplementing the token/email flow.
 * Main exports: list, detail, disable, enable, sendResetLink, AdminActionContext
 * Spec: docs/spec/05c §5.13 · docs/spec/07 §7.3.4 · Rules: BR-AU-03, BR-AU-08
 */
import {
  UserStatus,
  type AdminUserDetailDto,
  type AdminUserListItemDto,
  type ListAdminUsersQueryInput,
} from '@campuscoin/shared';
import { AuthTokenPurpose } from '../../generated/prisma/enums.js';
import { maskEmail } from '../../lib/maskEmail.js';
import { buildPaginationMeta, parsePagination, type PaginationMeta } from '../../lib/pagination.js';
import { conflict, notFound } from '../../lib/problem.js';
import { record } from '../audit/audit.service.js';
import { authRepository } from '../auth/auth.repository.js';
import * as authService from '../auth/auth.service.js';
import { revokeAllSessions } from '../sessions/session.service.js';
import { adminUsersRepository } from './admin-users.repository.js';

/** Everything an admin-action audit entry needs about the acting admin/request. */
export interface AdminActionContext {
  userId: string;
  role: string;
  ip?: string;
  userAgent?: string;
}

/** Result of {@link list}. */
export interface AdminUserListResult {
  data: AdminUserListItemDto[];
  meta: PaginationMeta;
}

/** `GET /admin/users` — searchable, filterable, paginated user list (emails masked). */
export async function list(query: ListAdminUsersQueryInput): Promise<AdminUserListResult> {
  const { page, limit, skip, take } = parsePagination(query);
  const filters = { q: query.q, status: query.status };
  const [rows, total] = await Promise.all([
    adminUsersRepository.list(filters, skip, take),
    adminUsersRepository.count(filters),
  ]);
  const data = rows.map((u) => ({
    id: u.id,
    fullName: u.fullName,
    maskedEmail: maskEmail(u.email),
    status: u.status as UserStatus,
    createdAt: u.createdAt.toISOString(),
  }));
  return { data, meta: buildPaginationMeta(page, limit, total) };
}

/**
 * `GET /admin/users/:id` — full email + a transaction COUNT only (never transaction content).
 * @throws {AppError} 404 when `id` is not a user.
 */
export async function detail(id: string): Promise<AdminUserDetailDto> {
  const user = await adminUsersRepository.findById(id);
  if (!user) throw notFound('User not found.');

  const transactionCount = await adminUsersRepository.countTransactions(id);
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    status: user.status as UserStatus,
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    transactionCount,
  };
}

/**
 * Disables a user account: revokes every session and invalidates every outstanding
 * verify-email/reset-password token FIRST, and only then flips `status` (security-fix follow-up,
 * Fix 5: if the session/token step throws, `status` is never flipped, so the admin UI still shows
 * "Disable" and the whole action can simply be retried from scratch — every step here is naturally
 * idempotent, so calling `disable` again on an already-disabled user is always safe). BR-AU-08.
 * A-L8: a second `revokeAllSessions` runs AFTER `status` flips too — a login that raced to
 * completion in the narrow window between the first revoke and the status update would otherwise
 * mint a session that step never saw, and its access token would stay valid for up to 15 minutes
 * after the account was "disabled". `revokeAllSessions` is idempotent (P15), so calling it twice
 * here is always safe.
 * @throws {AppError} 404 when `id` is not a user (student accounts only — an admin id 404s too,
 *   since `adminUsersRepository.findById` never returns a non-STUDENT row, Fix 2).
 */
export async function disable(id: string, actor: AdminActionContext): Promise<void> {
  const user = await adminUsersRepository.findById(id);
  if (!user) throw notFound('User not found.');

  const now = new Date();
  await Promise.all([
    revokeAllSessions(id),
    authRepository.invalidateUnusedTokens(id, AuthTokenPurpose.verify_email, now),
    authRepository.invalidateUnusedTokens(id, AuthTokenPurpose.reset_password, now),
  ]);
  await adminUsersRepository.setStatus(id, UserStatus.DISABLED);
  await revokeAllSessions(id); // A-L8: close the login-race window between the revoke above and this status flip.
  await record({
    action: 'admin.user.disable',
    actorId: actor.userId,
    actorRole: actor.role,
    entityType: 'user',
    entityId: id,
    ip: actor.ip,
    userAgent: actor.userAgent,
  });
}

/**
 * Re-activates a disabled user account, restoring it to whatever status it would have had absent
 * the disable — never `active` for an account that was never email-verified (security-fix
 * follow-up, Fix 1: a `pending` user disabled then re-enabled must come back `pending`, not
 * `active`, or disable->enable becomes a way to bypass email verification). Also clears
 * `deletedAt` when set (P16, docs/spec/09 §9.14: this is how "contact support within 30 days to
 * cancel" a self-requested account deletion is actually implemented — otherwise the
 * `cleanup.expired` job would still purge the account later even after an admin re-enables it).
 * @throws {AppError} 404 when `id` is not a user; 409 when `id` is not currently `disabled`.
 */
export async function enable(id: string, actor: AdminActionContext): Promise<void> {
  const user = await adminUsersRepository.findById(id);
  if (!user) throw notFound('User not found.');
  if (user.status !== UserStatus.DISABLED) throw conflict('User is not disabled.');

  const restoredStatus = user.emailVerifiedAt ? UserStatus.ACTIVE : UserStatus.PENDING;
  const hadPendingDeletion = user.deletedAt !== null;
  await adminUsersRepository.setStatusAndClearDeletion(id, restoredStatus);
  await record({
    action: 'admin.user.enable',
    actorId: actor.userId,
    actorRole: actor.role,
    entityType: 'user',
    entityId: id,
    ip: actor.ip,
    userAgent: actor.userAgent,
    ...(hadPendingDeletion ? { metadata: { cancelledDeletion: true } } : {}),
  });
}

/**
 * Sends a password-reset link to a user (reuses `authService.forgotPassword`, which silently
 * no-ops for a non-ACTIVE user, BR-AU-03). Passes `initiatedBy: actor.userId` so `forgotPassword`'s
 * own `auth.password.reset_requested` audit row is attributed to the ADMIN who triggered it (not
 * misread as the target requesting their own reset from the admin's IP, Fix 4). Always writes the
 * admin's own `admin.user.send_reset_link` audit row, even when `forgotPassword` throws (wrapped in
 * `try/finally`) — so "an admin attempted this" is never lost, matching `audit.service.record`'s
 * own philosophy that a failed action must still be knowable, while `record()` itself never throws.
 * @throws {AppError} 404 when `id` is not a user; rethrows whatever `forgotPassword` throws.
 */
export async function sendResetLink(id: string, actor: AdminActionContext): Promise<void> {
  const user = await adminUsersRepository.findById(id);
  if (!user) throw notFound('User not found.');

  try {
    await authService.forgotPassword(user.email, { ip: actor.ip, userAgent: actor.userAgent, initiatedBy: actor.userId });
  } finally {
    await record({
      action: 'admin.user.send_reset_link',
      actorId: actor.userId,
      actorRole: actor.role,
      entityType: 'user',
      entityId: id,
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
  }
}
