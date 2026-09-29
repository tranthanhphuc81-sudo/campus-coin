/**
 * users.service.ts
 * Business logic for `/api/v1/me/*`: read/update the caller's own profile, change password
 * (distinct from the unauthenticated reset-password flow), and manage active sessions
 * ("logged-in devices"). Every function takes `userId` from the verified token — never from a
 * client-supplied field.
 * Main exports: getProfile, updateProfile, changePassword, getAllowanceBaseline, listSessions,
 *   revokeSession
 * Spec: docs/spec/05a §5.2 (Table 15 – profile) · docs/spec/07 §7.3.1 · Rules: BR-AU-01, BR-AU-02, BR-AU-06
 */
import type { UpdateProfileInput } from '@campuscoin/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import type { UserModel } from '../../generated/prisma/models/User.js';
import { config } from '../../config/env.js';
import { emailTemplates } from '../../i18n/en.js';
import { queueEmail } from '../../integrations/mailer/index.js';
import type { Decimal } from '../../lib/money.js';
import { toMoney } from '../../lib/money.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { checkPasswordPolicy } from '../../lib/passwordPolicy.js';
import { accountLocked, notFound, validationFailed } from '../../lib/problem.js';
import { PASSWORD_POLICY_MESSAGES, recordFailedAttempt } from '../auth/auth.service.js';
import { record } from '../audit/audit.service.js';
import {
  listSessions as listSessionsFromRepo,
  revokeAllSessions,
  revokeSession as revokeSessionInRepo,
  type SessionContext,
  type SessionSummary,
} from '../sessions/session.service.js';
import type { UpdateProfileData } from './users.repository.js';
import { usersRepository } from './users.repository.js';

/**
 * Loads the caller's own user row.
 * @throws {AppError} 404 not-found when the account no longer exists (e.g. deleted between
 *   token issuance and this request).
 */
export async function getProfile(userId: string): Promise<UserModel> {
  const user = await usersRepository.findById(userId);
  if (!user) throw notFound('Account not found.');
  return user;
}

/** Only these `preferences` keys are ever merged in (matches `updateProfileSchema`'s `.strict()` shape). */
const PREFERENCES_KEYS = ['theme', 'fontScale', 'locale'] as const;

/** Shallow-merges the whitelisted `preferences` keys from `patch` onto `existing`. */
function mergePreferences(existing: unknown, patch: NonNullable<UpdateProfileInput['preferences']>): Prisma.InputJsonValue {
  const base = typeof existing === 'object' && existing !== null ? (existing as Record<string, unknown>) : {};
  const merged: Record<string, unknown> = { ...base };
  // `key` only ever iterates the fixed PREFERENCES_KEYS tuple above, never client input.
  /* eslint-disable security/detect-object-injection */
  for (const key of PREFERENCES_KEYS) {
    if (patch[key] !== undefined) merged[key] = patch[key];
  }
  /* eslint-enable security/detect-object-injection */
  return merged as Prisma.InputJsonValue;
}

/**
 * Updates the caller's profile from an already-validated, whitelisted body (`updateProfileSchema`
 * — BR-AU-01: `role`/`status`/`userId` can never appear here, Zod's `.strict()` rejects them
 * upstream at 422). Only fields present in `input` are touched; `preferences` is merged shallowly.
 * @returns The updated user row.
 * @throws {AppError} 404 not-found when the account no longer exists.
 */
export async function updateProfile(userId: string, input: UpdateProfileInput, ctx: SessionContext = {}): Promise<UserModel> {
  const current = await usersRepository.findById(userId);
  if (!current) throw notFound('Account not found.');

  const data: UpdateProfileData = {};
  const touchedFields: string[] = [];

  if (input.fullName !== undefined) {
    data.fullName = input.fullName;
    touchedFields.push('fullName');
  }
  if (input.academicYear !== undefined) {
    data.academicYear = input.academicYear;
    touchedFields.push('academicYear');
  }
  if (input.monthlyAllowanceBaseline !== undefined) {
    data.monthlyAllowanceBaseline = input.monthlyAllowanceBaseline === null ? null : toMoney(input.monthlyAllowanceBaseline);
    touchedFields.push('monthlyAllowanceBaseline');
  }
  if (input.monthlySavingsGoal !== undefined) {
    data.monthlySavingsGoal = input.monthlySavingsGoal === null ? null : toMoney(input.monthlySavingsGoal);
    touchedFields.push('monthlySavingsGoal');
  }
  if (input.currency !== undefined) {
    data.currency = input.currency;
    touchedFields.push('currency');
  }
  if (input.timezone !== undefined) {
    data.timezone = input.timezone;
    touchedFields.push('timezone');
  }
  if (input.preferences !== undefined) {
    data.preferences = mergePreferences(current.preferences, input.preferences);
    touchedFields.push('preferences');
  }
  if (input.aiOptIn !== undefined) {
    data.aiOptIn = input.aiOptIn;
    touchedFields.push('aiOptIn');
  }

  const updated = await usersRepository.updateProfile(userId, data);
  if (touchedFields.length > 0) {
    // Never log the new values themselves — only which fields changed.
    await record({
      action: 'user.profile.updated',
      actorId: userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      metadata: { fields: touchedFields },
    });
  }
  return updated;
}

/**
 * Changes the caller's own password (distinct from the unauthenticated reset flow): verifies
 * `currentPassword`, enforces the policy (+ must differ from the current password), then revokes
 * every *other* session (BR-AU-06) so the current device stays signed in while every other device
 * is signed out.
 * @throws {AppError} 422 validation-failed when `currentPassword` is wrong or the new password
 *   fails the policy / equals the current password; 429 account-locked once too many wrong
 *   `currentPassword` guesses have tripped the same lockout as a wrong login password.
 */
export async function changePassword(
  userId: string,
  currentSessionId: string,
  currentPassword: string,
  newPassword: string,
  ctx: SessionContext = {},
): Promise<void> {
  const user = await usersRepository.findById(userId);
  if (!user) throw notFound('Account not found.');

  // Security review 5: a wrong `currentPassword` is itself a password guess against this account,
  // so it must be gated by the same lockout as a wrong login password — checked *before* the
  // verify below so an already-locked account can't burn more Argon2 cycles either.
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    const retryAfterSeconds = Math.max(1, Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000));
    throw accountLocked(retryAfterSeconds, 'Too many failed attempts. Please try again later.');
  }

  const currentOk = await verifyPassword(user.passwordHash, currentPassword);
  if (!currentOk) {
    await recordFailedAttempt(user, ctx, 'change_password');
    throw validationFailed([{ field: 'currentPassword', message: 'Current password is incorrect.' }]);
  }

  const sameAsCurrent = await verifyPassword(user.passwordHash, newPassword);
  if (sameAsCurrent) {
    throw validationFailed([{ field: 'newPassword', message: 'New password must be different from your current password.' }]);
  }

  const policy = await checkPasswordPolicy(newPassword, { email: user.email });
  if (!policy.ok) {
    throw validationFailed([{ field: 'newPassword', message: PASSWORD_POLICY_MESSAGES[policy.reason] }]);
  }

  const passwordHash = await hashPassword(newPassword);
  await usersRepository.updatePassword(userId, passwordHash);
  // BR-AU-06: every other device is signed out; the session making this call stays alive.
  await revokeAllSessions(userId, { exceptFamilyId: currentSessionId });
  await queueEmail({
    to: user.email,
    jobId: `password-changed:${userId}:${Date.now()}`,
    ...emailTemplates.passwordChanged(user.fullName, `${config.app.appUrl}/forgot-password`),
  });
  await record({ action: 'auth.password.changed', actorId: userId, ip: ctx.ip, userAgent: ctx.userAgent });
}

/**
 * The caller's `monthlyAllowanceBaseline`, or `null` when unset or the account no longer exists.
 * Used by the anomaly detector's allowance gate (§5.14) — other modules go through this service
 * rather than `usersRepository` directly (CLAUDE.md: modules talk to each other via services only).
 */
export async function getAllowanceBaseline(userId: string): Promise<Decimal | null> {
  const user = await usersRepository.findById(userId);
  return user?.monthlyAllowanceBaseline ?? null;
}

/** Lists the caller's active sessions ("manage devices"). */
export function listSessions(userId: string): Promise<SessionSummary[]> {
  return listSessionsFromRepo(userId);
}

/**
 * Revokes one of the caller's own sessions. Revoking the caller's *current* session is allowed
 * (it just means this device signs itself out too, on its next request).
 * @returns `false` when `sessionId` does not belong to `userId` — the controller must turn that
 *   into a 404 (never 403: CLAUDE.md security invariant, don't reveal another user's resource).
 */
export async function revokeSession(userId: string, sessionId: string, ctx: SessionContext = {}): Promise<boolean> {
  const revoked = await revokeSessionInRepo(userId, sessionId);
  if (revoked) {
    await record({
      action: 'auth.session.revoked',
      actorId: userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      metadata: { familyId: sessionId },
    });
  }
  return revoked;
}
