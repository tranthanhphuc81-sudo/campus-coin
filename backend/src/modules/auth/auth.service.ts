/**
 * auth.service.ts
 * Business logic for registration, email verification, login (and its lockout/timing-safety
 * rules), refresh and logout. `verifyCredentials` is deliberately generic (email/password/role)
 * so the block D admin login can reuse the exact same password-check/lockout logic instead of
 * duplicating BR-AU-02..04.
 * Main exports: register, verifyEmail, resendVerification, forgotPassword, resetPassword,
 *   verifyCredentials, recordFailedAttempt, login, refresh, logout, logoutAll, PASSWORD_POLICY_MESSAGES
 * Spec: docs/spec/05a §5.1 (BR-AU table) · docs/spec/09 §9.5 · Rules: BR-AU-01..08
 */
import {
  LOCKOUT_DURATIONS_MIN,
  LOGIN_MAX_FAILED_ATTEMPTS,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  RESET_PASSWORD_TOKEN_TTL_MS,
  Role,
  SHADOW_LOCKOUT_COUNTER_TTL_SEC,
  UserStatus,
  VERIFY_EMAIL_TOKEN_TTL_MS,
  type LoginInput,
  type RegisterInput,
  type Role as RoleType,
} from '@campuscoin/shared';
import { AuthTokenPurpose } from '../../generated/prisma/enums.js';
import type { UserModel } from '../../generated/prisma/models/User.js';
import { config } from '../../config/env.js';
import { emailTemplates } from '../../i18n/en.js';
import { queueEmail } from '../../integrations/mailer/index.js';
import { signAccessToken } from '../../lib/jwt.js';
import { dummyVerify, hashPassword, passwordNeedsRehash, verifyPassword } from '../../lib/password.js';
import { checkPasswordPolicy, type PasswordPolicyFailureReason } from '../../lib/passwordPolicy.js';
import {
  accountDisabled,
  accountLocked,
  emailNotVerified,
  invalidToken,
  unauthenticated,
  validationFailed,
} from '../../lib/problem.js';
import { redis } from '../../lib/redis.js';
import { generateToken, sha256Hex } from '../../lib/tokens.js';
import { record } from '../audit/audit.service.js';
import {
  createSession,
  revokeAllSessions,
  revokeSessionByToken,
  rotate,
  type SessionContext,
} from '../sessions/session.service.js';
import { authRepository } from './auth.repository.js';

/**
 * Friendly English messages for each {@link PasswordPolicyFailureReason} (BR-AU-02). Exported so
 * `users.service.ts` (`PATCH /me/password`) can report the exact same wording as register/reset.
 */
export const PASSWORD_POLICY_MESSAGES: Record<PasswordPolicyFailureReason, string> = {
  too_short: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
  too_long: `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`,
  common: 'This password is too common. Please choose a stronger one.',
  breached: 'This password has appeared in a known data breach. Please choose a different one.',
  contains_email: 'Password must not contain your email address.',
};

/** Identical response body for every register/resend outcome — never reveals whether the email exists. */
export const REGISTER_ACK_MESSAGE = 'If the details are valid, check your inbox to verify your email.';

/** Identical response body for every `/auth/forgot-password` outcome (BR-AU-03: no user enumeration). */
export const FORGOT_PASSWORD_ACK_MESSAGE = 'If an account with that email exists, we sent a password reset link.';

/** Creates a fresh `verify_email` AuthToken, invalidating any previous unused one, and emails the link. */
async function issueVerificationEmail(user: UserModel): Promise<void> {
  const now = new Date();
  await authRepository.invalidateUnusedTokens(user.id, AuthTokenPurpose.verify_email, now);
  const token = generateToken();
  const authToken = await authRepository.createAuthToken({
    userId: user.id,
    purpose: AuthTokenPurpose.verify_email,
    tokenHash: sha256Hex(token),
    expiresAt: new Date(now.getTime() + VERIFY_EMAIL_TOKEN_TTL_MS),
  });
  const link = `${config.app.appUrl}/verify-email?token=${token}`;
  await queueEmail({
    to: user.email,
    jobId: `verify-email-${authToken.id}`,
    ...emailTemplates.verifyEmail(user.fullName, link),
  });
}

/**
 * Sent when `/auth/register` targets a still-pending account (security review B): re-registering
 * proves nothing about inbox ownership, so this never touches the pending row's credentials.
 * Instead it invalidates every outstanding verify_email/reset_password link and issues a fresh
 * single-use `reset_password` token — clicking it (proving inbox ownership) is what lets the real
 * owner choose the account's password and activate it, via the normal `resetPassword` flow.
 */
async function issueFinishSignUpEmail(user: UserModel): Promise<void> {
  const now = new Date();
  await authRepository.invalidateUnusedTokens(user.id, AuthTokenPurpose.verify_email, now);
  await authRepository.invalidateUnusedTokens(user.id, AuthTokenPurpose.reset_password, now);
  const token = generateToken();
  const authToken = await authRepository.createAuthToken({
    userId: user.id,
    purpose: AuthTokenPurpose.reset_password,
    tokenHash: sha256Hex(token),
    expiresAt: new Date(now.getTime() + VERIFY_EMAIL_TOKEN_TTL_MS),
  });
  const link = `${config.app.appUrl}/reset-password?token=${token}`;
  await queueEmail({
    to: user.email,
    jobId: `finish-signup-${authToken.id}`,
    ...emailTemplates.finishSignUp(user.fullName, link),
  });
}

/**
 * Registers a new student account (BR-AU-01: role is always `student`, never from the body).
 * Always completes with the same {@link REGISTER_ACK_MESSAGE} regardless of outcome — the caller
 * (controller) responds 202 either way — so a new signup and a duplicate email are
 * indistinguishable to the client (BR-AU-03 / TC-01, TC-02).
 * @throws {AppError} 422 validation-failed when the password fails the server-side policy.
 */
export async function register(input: RegisterInput, ctx: SessionContext = {}): Promise<void> {
  const policy = await checkPasswordPolicy(input.password, { email: input.email });
  if (!policy.ok) {
    throw validationFailed([{ field: 'password', message: PASSWORD_POLICY_MESSAGES[policy.reason] }]);
  }

  // BR-AU-03: hash unconditionally, even for a duplicate email, so both branches take ~the same time.
  const passwordHash = await hashPassword(input.password);
  const existing = await authRepository.findByEmail(input.email);

  if (existing) {
    if (existing.status === UserStatus.PENDING) {
      // Security review B: never overwrite the pending row's password/name here — a
      // re-registration attempt does not prove the caller owns the inbox. See
      // `issueFinishSignUpEmail` for how the real owner actually claims the account.
      await issueFinishSignUpEmail(existing);
    } else {
      await queueEmail({
        to: existing.email,
        jobId: `account-exists:${existing.id}:${Date.now()}`,
        ...emailTemplates.accountExists(
          existing.fullName,
          `${config.app.appUrl}/login`,
          `${config.app.appUrl}/forgot-password`,
        ),
      });
    }
    await record({
      action: 'user.register',
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      metadata: { outcome: 'existing_email' },
    });
    return;
  }

  const user = await authRepository.createUser({ email: input.email, passwordHash, fullName: input.fullName });
  await issueVerificationEmail(user);
  await record({
    action: 'user.register',
    actorId: user.id,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    metadata: { outcome: 'created' },
  });
}

/**
 * Consumes an email-verification token (single-use, race-safe) and activates the account.
 * @throws {AppError} 400 invalid-token when the token is unknown, already used or expired.
 */
export async function verifyEmail(token: string): Promise<void> {
  const now = new Date();
  const authToken = await authRepository.findActiveAuthToken(sha256Hex(token), AuthTokenPurpose.verify_email, now);
  if (!authToken) throw invalidToken('This link is invalid or has expired. Please request a new one.');

  const consumed = await authRepository.consumeAuthToken(authToken.id, now);
  if (consumed.count === 0) throw invalidToken('This link is invalid or has expired. Please request a new one.');

  await authRepository.activate(authToken.userId);
  await record({ action: 'user.email.verified', actorId: authToken.userId });
}

/**
 * Re-sends the verification email for a still-pending account. Always completes silently (no
 * error, no outcome signal) — the controller responds 202 with the same message either way.
 */
export async function resendVerification(email: string): Promise<void> {
  const user = await authRepository.findByEmail(email);
  if (user && user.status === UserStatus.PENDING) {
    await issueVerificationEmail(user);
  }
}

/**
 * Requests a password-reset link (BR-AU-03: always completes the same way for an unknown email,
 * a pending account or a disabled account — only an ACTIVE user actually receives anything).
 * Creating the token and queuing the email both only happen in the "active user" branch, so the
 * response never differs based on whether that branch ran. When `ctx.initiatedBy` is set (the
 * admin portal's `sendResetLink` calling this on a user's behalf, Fix 4), the audit row is
 * attributed to that admin instead of the target user, with `metadata` recording who the real
 * target was — the normal student-initiated path's audit shape is unchanged.
 */
export async function forgotPassword(email: string, ctx: SessionContext = {}): Promise<void> {
  const user = await authRepository.findByEmail(email);
  if (!user || user.status !== UserStatus.ACTIVE) return;

  const now = new Date();
  await authRepository.invalidateUnusedTokens(user.id, AuthTokenPurpose.reset_password, now);
  const token = generateToken();
  const authToken = await authRepository.createAuthToken({
    userId: user.id,
    purpose: AuthTokenPurpose.reset_password,
    tokenHash: sha256Hex(token),
    expiresAt: new Date(now.getTime() + RESET_PASSWORD_TOKEN_TTL_MS),
  });
  const link = `${config.app.appUrl}/reset-password?token=${token}`;
  await queueEmail({
    to: user.email,
    jobId: `reset-password-${authToken.id}`,
    ...emailTemplates.resetPassword(user.fullName, link, RESET_PASSWORD_TOKEN_TTL_MS / 60_000),
  });
  await record({
    action: 'auth.password.reset_requested',
    actorId: ctx.initiatedBy ?? user.id,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    ...(ctx.initiatedBy ? { metadata: { via: 'admin', targetUserId: user.id } } : {}),
  });
}

/**
 * Completes a password reset: consumes the token (single-use, race-safe), validates the new
 * password against the policy, updates the hash, clears lockout state, invalidates any other
 * unused reset tokens, revokes every session (BR-AU-06) and emails a confirmation. Also doubles
 * as the "finish sign-up" flow (security review B): for a still-`pending` account, the same
 * single-use link proves inbox ownership, so completing it also activates the account
 * (`emailVerifiedAt` set, `user.email.verified` audited) exactly like `verifyEmail` would.
 * The password policy is checked *before* consuming the token, so a weak password never burns
 * the link (the user can retry with the same link).
 * @throws {AppError} 400 invalid-token when the token is unknown/used/expired, or the account is
 *   `disabled`; 422 validation-failed when the new password fails the policy.
 */
export async function resetPassword(token: string, newPassword: string, ctx: SessionContext = {}): Promise<void> {
  const now = new Date();
  const tokenHash = sha256Hex(token);
  const authToken = await authRepository.findActiveAuthToken(tokenHash, AuthTokenPurpose.reset_password, now);
  if (!authToken) throw invalidToken('This link is invalid or has expired. Please request a new one.');

  const user = await authRepository.findById(authToken.userId);
  // Security review: a disabled account (and one that no longer exists) must not be able to
  // complete a reset even if a token was somehow still active for it (e.g. disabled after the
  // link was emailed) — `pending` is allowed through: this link is also the finish-sign-up flow.
  // Same generic message as every other invalid-token case, never reveals the account's state.
  if (!user || user.status === UserStatus.DISABLED) {
    throw invalidToken('This link is invalid or has expired. Please request a new one.');
  }

  const policy = await checkPasswordPolicy(newPassword, { email: user.email });
  if (!policy.ok) {
    throw validationFailed([{ field: 'newPassword', message: PASSWORD_POLICY_MESSAGES[policy.reason] }]);
  }

  const consumed = await authRepository.consumeAuthToken(authToken.id, now);
  if (consumed.count === 0) throw invalidToken('This link is invalid or has expired. Please request a new one.');

  const passwordHash = await hashPassword(newPassword);
  await authRepository.resetPasswordAndUnlock(user.id, passwordHash);
  await authRepository.invalidateUnusedTokens(user.id, AuthTokenPurpose.reset_password, now);
  if (user.status === UserStatus.PENDING) {
    // Race-safe (updateMany where status: pending) — a no-op if something else already activated it.
    await authRepository.activate(user.id);
    await record({ action: 'user.email.verified', actorId: user.id, ip: ctx.ip, userAgent: ctx.userAgent });
  }
  await revokeAllSessions(user.id); // BR-AU-06: a password reset signs out every device.
  await queueEmail({
    to: user.email,
    jobId: `password-changed-${authToken.id}`,
    ...emailTemplates.passwordChanged(user.fullName, `${config.app.appUrl}/forgot-password`),
  });
  await record({ action: 'auth.password.reset', actorId: user.id, ip: ctx.ip, userAgent: ctx.userAgent });
}

/** Discriminated outcome of {@link verifyCredentials}. */
export type VerifyCredentialsResult =
  | { outcome: 'success'; user: UserModel }
  | { outcome: 'unknown_email' }
  | { outcome: 'locked'; retryAfterSeconds: number }
  | { outcome: 'bad_password' }
  | { outcome: 'wrong_role' }
  | { outcome: 'pending' }
  | { outcome: 'disabled' };

/** Input to {@link verifyCredentials}. */
export interface VerifyCredentialsInput {
  email: string;
  password: string;
  /** Only an account with this exact role may succeed (students via `/auth/login`, admins via `/admin/auth/login`). */
  expectedRole: RoleType;
  ctx?: SessionContext;
}

/** Maps a 1-based lockout occurrence count to a duration in minutes (BR-AU-04, escalating). */
function lockoutMinutesFor(occurrence: number): number {
  const index = Math.min(occurrence - 1, LOCKOUT_DURATIONS_MIN.length - 1);
  // `index` is derived from a bounded arithmetic expression above, never client input.
  // eslint-disable-next-line security/detect-object-injection
  return LOCKOUT_DURATIONS_MIN[index] as number;
}

/** Redis key: failed-attempt counter for an unknown email's `sha256(email)` hash (never the raw email). */
function shadowLockoutCountKey(emailHash: string): string {
  return `auth:shadow-lockout:count:${emailHash}`;
}
/** Redis key: presence + TTL marks an unknown email as currently "locked" (value = lockedUntil epoch ms). */
function shadowLockoutUntilKey(emailHash: string): string {
  return `auth:shadow-lockout:until:${emailHash}`;
}

/**
 * A-M3: mimics the real-account lockout (BR-AU-04) for an email that matches no account, using
 * Redis (there is no DB row to carry `failedLoginCount`/`lockedUntil`) keyed only by
 * `sha256(email)`. Without this, a real (existing) account eventually returns 429 account-locked
 * after 5 fails while an unknown email always returns a plain 401 — letting an attacker
 * distinguish "registered" from "not registered" in 6 requests and undermining the
 * register/forgot-password flows' deliberate non-enumeration design. Reuses
 * {@link lockoutMinutesFor} so the escalating-duration policy can never drift from the real path.
 * Calls {@link dummyVerify} in every branch (parity with the bad_password/real-locked branches).
 */
async function recordUnknownEmailAttempt(
  email: string,
  ctx: SessionContext,
  extraMetadata: Record<string, unknown>,
): Promise<VerifyCredentialsResult> {
  const emailHash = sha256Hex(email.trim().toLowerCase());
  const lockedUntilRaw = await redis.get(shadowLockoutUntilKey(emailHash));
  await dummyVerify(); // BR-AU-03: spend ~the same time as a real password check, every branch below

  if (lockedUntilRaw !== null) {
    const lockedUntilMs = Number(lockedUntilRaw);
    if (lockedUntilMs > Date.now()) {
      const retryAfterSeconds = Math.max(1, Math.ceil((lockedUntilMs - Date.now()) / 1000));
      await record({
        action: 'auth.login.failed',
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        metadata: { reason: 'locked', ...extraMetadata },
      });
      return { outcome: 'locked', retryAfterSeconds };
    }
  }

  const count = await redis.incr(shadowLockoutCountKey(emailHash));
  await redis.expire(shadowLockoutCountKey(emailHash), SHADOW_LOCKOUT_COUNTER_TTL_SEC);
  if (count % LOGIN_MAX_FAILED_ATTEMPTS === 0) {
    const minutes = lockoutMinutesFor(count / LOGIN_MAX_FAILED_ATTEMPTS);
    await redis.set(shadowLockoutUntilKey(emailHash), String(Date.now() + minutes * 60_000), 'EX', minutes * 60);
  }

  await record({
    action: 'auth.login.failed',
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    metadata: { reason: 'unknown_email', ...extraMetadata },
  });
  return { outcome: 'unknown_email' };
}

/**
 * Handles one failed authentication attempt against a user's account: counts it, locks + emails
 * on the Nth attempt, audits `auth.login.failed` (and `auth.locked` when the lock trips) with
 * `reason`. Shared by a wrong password (student/admin login), a wrong TOTP/recovery code
 * (admin MFA) and a wrong `currentPassword` (`PATCH /me/password`) so lockout can never be
 * bypassed by switching to whichever of those three checks the attacker's guess fails against
 * (security review finding — closes a brute-force loop across the password + MFA steps).
 * @param extraMetadata - Extra fields merged into `auth.login.failed`'s metadata (e.g. `portal`).
 */
export async function recordFailedAttempt(
  user: UserModel,
  ctx: SessionContext,
  reason: string,
  extraMetadata: Record<string, unknown> = {},
): Promise<void> {
  const newCount = await authRepository.incrementFailedLoginCount(user.id);
  if (newCount % LOGIN_MAX_FAILED_ATTEMPTS === 0) {
    const minutes = lockoutMinutesFor(newCount / LOGIN_MAX_FAILED_ATTEMPTS);
    const lockedUntil = new Date(Date.now() + minutes * 60_000);
    await authRepository.lockAccount(user.id, lockedUntil);
    await queueEmail({
      to: user.email,
      jobId: `lockout:${user.id}:${lockedUntil.getTime()}`,
      ...emailTemplates.accountLocked(user.fullName, minutes, `${config.app.appUrl}/forgot-password`),
    });
    await record({
      action: 'auth.locked',
      actorId: user.id,
      actorRole: user.role,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      metadata: { minutes, reason, ...extraMetadata },
    });
  }
  await record({
    action: 'auth.login.failed',
    actorId: user.id,
    actorRole: user.role,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    metadata: { reason, ...extraMetadata },
  });
}

/**
 * Verifies email + password against a specific expected role, enforcing timing-safety
 * (BR-AU-03), lockout (BR-AU-04) and account-state gates. Reused by both student `/auth/login`
 * and (block D) admin `/admin/auth/login` so the rules never drift between the two.
 * Never throws for an expected bad-credentials outcome — callers map {@link VerifyCredentialsResult}
 * to the right HTTP response themselves.
 */
export async function verifyCredentials(input: VerifyCredentialsInput): Promise<VerifyCredentialsResult> {
  const ctx = input.ctx ?? {};
  // Table 58 metadata: tags every audit row from an admin-portal login attempt.
  const portalMeta = input.expectedRole === Role.ADMIN ? { portal: 'admin' } : {};
  const user = await authRepository.findByEmail(input.email);

  if (!user) {
    // A-M3: shadow-lockout an unknown email exactly like a real one, so an attacker can't tell
    // "not registered" apart from "registered, not locked yet" by the response.
    return await recordUnknownEmailAttempt(input.email, ctx, portalMeta);
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    // A-M3: timing parity with the bad_password/unknown_email branches (both spend real argon2
    // time via dummyVerify/verifyPassword) — returning instantly here was itself a timing side
    // channel that let an attacker tell "known, locked account" apart from "unknown email" despite
    // both returning the same HTTP status. Also audited (was previously silently unaudited),
    // so §9.12's failed-login alerting can see attempts against an already-locked account.
    await dummyVerify();
    const retryAfterSeconds = Math.max(1, Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000));
    await record({
      action: 'auth.login.failed',
      actorId: user.id,
      actorRole: user.role,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      metadata: { reason: 'locked', ...portalMeta },
    });
    return { outcome: 'locked', retryAfterSeconds };
  }

  const passwordOk = await verifyPassword(user.passwordHash, input.password);
  if (!passwordOk) {
    await recordFailedAttempt(user, ctx, 'bad_password', portalMeta);
    return { outcome: 'bad_password' };
  }

  // Correct password from here on; role/status gates count as neither a failure nor a lockout hit,
  // but are still audited (Table 58) so an investigation can see *why* a login didn't succeed.
  if (user.role !== input.expectedRole) {
    await record({
      action: 'auth.login.failed',
      actorId: user.id,
      actorRole: user.role,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      metadata: { reason: 'wrong_role', ...portalMeta },
    });
    return { outcome: 'wrong_role' };
  }
  if (user.status === UserStatus.PENDING) {
    await record({
      action: 'auth.login.failed',
      actorId: user.id,
      actorRole: user.role,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      metadata: { reason: 'pending', ...portalMeta },
    });
    return { outcome: 'pending' };
  }
  if (user.status === UserStatus.DISABLED) {
    await record({
      action: 'auth.login.failed',
      actorId: user.id,
      actorRole: user.role,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      metadata: { reason: 'disabled', ...portalMeta },
    });
    return { outcome: 'disabled' };
  }

  const newPasswordHash = passwordNeedsRehash(user.passwordHash) ? await hashPassword(input.password) : undefined;

  if (input.expectedRole === Role.ADMIN) {
    // BR-AU-04/security review: do NOT reset failedLoginCount/lockedUntil at the password step for
    // an admin login — only after MFA also succeeds (admin-auth.service `completeLogin`). Otherwise
    // an attacker who knows/guesses the correct password could reset the lockout counter on every
    // attempt and brute-force the TOTP/recovery code with no effective limit.
    if (newPasswordHash) await authRepository.rehashPassword(user.id, newPasswordHash);
    return {
      outcome: 'success',
      user: { ...user, ...(newPasswordHash ? { passwordHash: newPasswordHash } : {}) },
    };
  }

  await authRepository.recordSuccessfulLogin(user.id, { newPasswordHash });
  return {
    outcome: 'success',
    user: { ...user, failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date(), ...(newPasswordHash ? { passwordHash: newPasswordHash } : {}) },
  };
}

/** Result of a successful {@link login}. */
export interface LoginResult {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: UserModel;
}

/**
 * Full student login flow: {@link verifyCredentials} against `Role.STUDENT`, then (on success)
 * creates a session, signs an access token and audits `auth.login.success`.
 * @throws {AppError} 401 (unknown email / bad password / admin credentials here), 429
 *   account-locked, 403 email-not-verified / account-disabled.
 */
export async function login(input: LoginInput, ctx: SessionContext = {}): Promise<LoginResult> {
  const result = await verifyCredentials({ email: input.email, password: input.password, expectedRole: Role.STUDENT, ctx });

  switch (result.outcome) {
    case 'unknown_email':
    case 'bad_password':
    case 'wrong_role':
      throw unauthenticated('Invalid email or password.');
    case 'locked':
      throw accountLocked(result.retryAfterSeconds, 'Too many failed sign-in attempts. Please try again later.');
    case 'pending':
      throw emailNotVerified('Please verify your email address before signing in.');
    case 'disabled':
      throw accountDisabled('This account has been disabled.');
    default:
      break;
  }

  const { user } = result;
  const session = await createSession({
    userId: user.id,
    role: Role.STUDENT,
    rememberMe: input.rememberMe,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });
  const signed = await signAccessToken({ userId: user.id, role: Role.STUDENT, sessionId: session.sessionId });
  await record({ action: 'auth.login.success', actorId: user.id, actorRole: Role.STUDENT, ip: ctx.ip, userAgent: ctx.userAgent });

  return {
    accessToken: signed.token,
    expiresIn: signed.expiresIn,
    refreshToken: session.refreshToken,
    refreshExpiresAt: session.expiresAt,
    user,
  };
}

/** Result of a successful {@link refresh}. */
export interface RefreshResult {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: UserModel;
}

/**
 * Rotates a refresh-token cookie into a new pair (BR-AU-05/06/07). Delegates all validation to
 * `sessions/session.service.rotate`.
 * @throws {AppError} 401 on any invalid/expired/reused/revoked token.
 */
export async function refresh(rawToken: string, ctx: SessionContext = {}): Promise<RefreshResult> {
  const rotated = await rotate(rawToken, ctx);
  const signed = await signAccessToken({ userId: rotated.user.id, role: rotated.user.role, sessionId: rotated.sessionId });
  const user = await authRepository.findById(rotated.user.id);
  if (!user) throw unauthenticated('Account no longer exists');

  return {
    accessToken: signed.token,
    expiresIn: signed.expiresIn,
    refreshToken: rotated.refreshToken,
    refreshExpiresAt: rotated.expiresAt,
    user,
  };
}

/**
 * Logs out the session behind `rawToken` (if any). Never throws: an absent/unknown/stale cookie
 * is a silent no-op, since logout must always succeed from the client's point of view.
 */
export async function logout(rawToken: string | undefined, ctx: SessionContext = {}): Promise<void> {
  if (!rawToken) return;
  const revoked = await revokeSessionByToken(rawToken);
  if (revoked) {
    await record({
      action: 'auth.logout',
      actorId: revoked.userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      metadata: { familyId: revoked.familyId },
    });
  }
}

/** Logs out every session of `userId` ("sign out everywhere") and audits `auth.logout_all`. */
export async function logoutAll(userId: string, ctx: SessionContext = {}): Promise<void> {
  await revokeAllSessions(userId);
  await record({ action: 'auth.logout_all', actorId: userId, ip: ctx.ip, userAgent: ctx.userAgent });
}
