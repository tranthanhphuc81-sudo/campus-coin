/**
 * admin-auth.service.ts
 * Business logic for the admin login + mandatory TOTP MFA challenge: `adminLogin` reuses
 * `auth.service.verifyCredentials` (same lockout/timing-safety rules as student login, BR-AU-02..04)
 * and issues a short-lived MFA challenge token. `adminMfaVerify` consumes that token exactly once,
 * accepts either a TOTP code or a one-time recovery code, and only then creates the real admin
 * session. A-M4 (P19 security review): MFA enrolment is no longer something `/admin/auth/login`
 * can trigger — an admin's TOTP secret + recovery codes are generated once, at account-creation
 * time, by `scripts/create-admin.ts`; whoever completes the very first `/admin/auth/login` no
 * longer gets to "claim" the second factor. If an admin somehow has no `mfaSecretEnc` at all
 * (bootstrap skipped/corrupted), login now fails closed instead of handing out a fresh secret.
 * Main exports: adminLogin, adminMfaVerify, AdminLoginResult, AdminMfaVerifyResult
 * Spec: docs/spec/05a §5.1.2 · docs/spec/09 §9.5 (MFA row), §9.6, §9.12 Table 58 · Rules: BR-AU-09
 */
import { timingSafeEqual } from 'node:crypto';
import { MFA_MAX_ATTEMPTS, MFA_TOKEN_TTL_MS, Role, UserStatus } from '@campuscoin/shared';
import type { AdminLoginInput, MfaVerifyInput } from '@campuscoin/shared';
import type { UserModel } from '../../generated/prisma/models/User.js';
import { decrypt, hashRecoveryCode } from '../../lib/crypto.js';
import { signAccessToken, signMfaToken, verifyMfaToken } from '../../lib/jwt.js';
import {
  accountDisabled,
  accountLocked,
  emailNotVerified,
  mfaInvalid,
  unauthenticated,
} from '../../lib/problem.js';
import { redis } from '../../lib/redis.js';
import { normalizeRecoveryCode } from '../../lib/tokens.js';
import { TOTP_LAST_STEP_TTL_SEC, verifyTotp } from '../../lib/totp.js';
import { record } from '../audit/audit.service.js';
import { authRepository } from '../auth/auth.repository.js';
import { recordFailedAttempt, verifyCredentials, type VerifyCredentialsResult } from '../auth/auth.service.js';
import { createSession, type SessionContext } from '../sessions/session.service.js';
import { adminAuthRepository } from './admin-auth.repository.js';

const MFA_TOKEN_TTL_SEC = Math.floor(MFA_TOKEN_TTL_MS / 1000);
/** TTL of the short-lived per-`jti` claim lock (item 7): long enough to cover one HTTP request. */
const MFA_CLAIM_LOCK_TTL_SEC = 10;

/** Redis key marking an `mfaToken` as already consumed (single-use). */
function usedKey(jti: string): string {
  return `mfa:used:${jti}`;
}
/** Redis key counting wrong attempts against one `mfaToken`. */
function attemptsKey(jti: string): string {
  return `mfa:attempts:${jti}`;
}
/** Redis key remembering the last accepted TOTP time step for a user (replay protection). */
function lastStepKey(userId: string): string {
  return `mfa:last-step:${userId}`;
}
/** Redis key claiming exclusive, momentary ownership of one `jti` verify attempt (item 7: atomicity). */
function claimLockKey(jti: string): string {
  return `mfa:lock:${jti}`;
}

/**
 * Compare-and-set Lua script: only overwrites `lastStepKey` when the new time step is strictly
 * greater than the one already stored, so a slower concurrent request (e.g. a replayed/parallel
 * verify) can never roll the replay-protection watermark backwards.
 */
const LAST_STEP_CAS_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if (not current) or tonumber(ARGV[1]) > tonumber(current) then
  redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
  return 1
end
return 0
`;

/** Applies {@link LAST_STEP_CAS_SCRIPT} for `userId`'s accepted TOTP time step. */
async function casLastStep(userId: string, timeStep: number): Promise<void> {
  await redis.eval(LAST_STEP_CAS_SCRIPT, 1, lastStepKey(userId), String(timeStep), String(TOTP_LAST_STEP_TTL_SEC));
}

/** Result of a successful {@link adminLogin}: always the MFA challenge, never a session yet. */
export interface AdminLoginResult {
  mfaRequired: true;
  mfaToken: string;
  expiresIn: number;
}

/** Maps every non-success {@link VerifyCredentialsResult} outcome to the response the admin sees. */
function throwForFailedCredentials(result: VerifyCredentialsResult): never {
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
      // Exhaustiveness guard: every non-'success' outcome is handled above.
      throw unauthenticated('Invalid email or password.');
  }
}

/**
 * First step of admin login: verifies email/password against `Role.ADMIN` (BR-AU-02..04, shared
 * with student login), then issues a short-lived MFA challenge token. A-M4: no longer offers
 * open MFA enrolment for an admin with no `mfaSecretEnc` — that would let whoever logs in first
 * (knowing only the `.env` bootstrap password) claim the second factor for themselves. An admin
 * created via `scripts/create-admin.ts` always already has an enrolled secret; reaching this
 * branch means the bootstrap step was skipped or the row is corrupted, so it fails closed and is
 * audited rather than silently handing out a fresh secret.
 * @throws {AppError} 401 generic (unknown email / bad password / student credentials here, or no
 *   MFA secret enrolled), 429 account-locked, 403 email-not-verified / account-disabled.
 */
export async function adminLogin(input: AdminLoginInput, ctx: SessionContext = {}): Promise<AdminLoginResult> {
  const result = await verifyCredentials({ email: input.email, password: input.password, expectedRole: Role.ADMIN, ctx });
  if (result.outcome !== 'success') throwForFailedCredentials(result);

  const { user } = result;

  if (!user.mfaSecretEnc) {
    await record({
      action: 'admin.mfa.failed',
      actorId: user.id,
      actorRole: user.role,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      metadata: { reason: 'not_enrolled', portal: 'admin' },
    });
    throw unauthenticated('This admin account is not fully configured. Contact another administrator.');
  }

  const signed = await signMfaToken({ userId: user.id });
  return { mfaRequired: true, mfaToken: signed.token, expiresIn: signed.expiresIn };
}

/** Result of a successful {@link adminMfaVerify}: the real session, finally. */
export interface AdminMfaVerifyResult {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: UserModel;
}

/**
 * Records `admin.mfa.failed` (Table 58, tagged `portal: 'admin'` + `reason`) and throws the
 * generic 401 `mfa-invalid` (never reveals which check failed — TC-08). Every failure path of
 * `adminMfaVerify` goes through this, including the ones that never reach a specific TOTP/
 * recovery-code check (already-used token, attempts exhausted, lost the claim-lock race).
 */
async function failMfa(
  userId: string | undefined,
  ctx: SessionContext,
  reason: string,
  actorRole?: string,
): Promise<never> {
  await record({
    action: 'admin.mfa.failed',
    actorId: userId,
    actorRole,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    metadata: { reason, portal: 'admin' },
  });
  throw mfaInvalid();
}

/** Constant-time comparison of two equal-length hex hashes (both are always SHA-256 hex, 64 chars). */
function hashesEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * Handles the code/recovery-code check for an admin who already finished enrolment. A wrong TOTP
 * code or a wrong recovery code both count as a failed *account* attempt (security review 1b) —
 * `recordFailedAttempt` reuses the exact wrong-password lockout path, so the counter/lockout
 * closes across the password + MFA steps regardless of which check the attacker's guess fails.
 */
async function verifyEnrolledMfa(user: UserModel, input: MfaVerifyInput, ctx: SessionContext): Promise<void> {
  if (input.code) {
    if (!user.mfaSecretEnc) return await failMfa(user.id, ctx, 'no_secret', user.role);
    const secret = decrypt(Buffer.from(user.mfaSecretEnc as Uint8Array));
    const lastStepRaw = await redis.get(lastStepKey(user.id));
    const afterTimeStep = lastStepRaw !== null ? Number(lastStepRaw) : undefined;
    const verified = await verifyTotp(secret, input.code, afterTimeStep);
    if (!verified.valid) {
      await recordFailedAttempt(user, ctx, 'mfa_code_invalid', { portal: 'admin' });
      return await failMfa(user.id, ctx, 'code_invalid', user.role);
    }
    await casLastStep(user.id, verified.timeStep as number);
    return;
  }

  // input.recoveryCode (mfaVerifySchema guarantees exactly one of the two is present).
  const hash = hashRecoveryCode(normalizeRecoveryCode(input.recoveryCode as string));
  const codes = ((user.mfaRecoveryCodes as unknown as string[] | null) ?? []).slice();
  const matchIndex = codes.findIndex((stored) => hashesEqual(stored, hash));
  if (matchIndex === -1) {
    await recordFailedAttempt(user, ctx, 'mfa_recovery_invalid', { portal: 'admin' });
    return await failMfa(user.id, ctx, 'recovery_invalid', user.role);
  }

  const remaining = codes.filter((_, i) => i !== matchIndex);
  const removed = await adminAuthRepository.removeRecoveryCode(user.id, codes, remaining);
  // Lost the race with another concurrent use of the same code.
  if (!removed) return await failMfa(user.id, ctx, 'recovery_race_lost', user.role);
  await record({
    action: 'admin.mfa.recovery_used',
    actorId: user.id,
    actorRole: user.role,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    metadata: { remaining: remaining.length },
  });
}

/**
 * Second (final) step of admin login: verifies the `mfaToken` + code/recovery-code, then creates
 * the real admin session. Single-use (`mfa:used:{jti}`), rate-limited by attempt count
 * (`mfa:attempts:{jti}`, dies after {@link MFA_MAX_ATTEMPTS}), and race-safe for recovery-code
 * consumption. A-M4: fails closed (never enrols) if the admin somehow has no `mfaSecretEnc`.
 * @throws {AppError} 401 unauthenticated when `mfaToken` itself is invalid/expired, 401
 *   mfa-invalid for a wrong/reused/replayed code, a dead (attempts-exhausted / already-used)
 *   token, or a missing MFA secret.
 */
export async function adminMfaVerify(input: MfaVerifyInput, ctx: SessionContext = {}): Promise<AdminMfaVerifyResult> {
  const { userId, jti } = await verifyMfaToken(input.mfaToken); // 401 unauthenticated on bad/expired token

  // Item 7a: claim exclusive, momentary ownership of this jti so two concurrent requests for the
  // *same* mfaToken can never both pass the used/attempts checks and race each other into the DB.
  // Released in `finally` below — this only guards true concurrency, not sequential retries.
  const claimed = await redis.set(claimLockKey(jti), '1', 'EX', MFA_CLAIM_LOCK_TTL_SEC, 'NX');
  if (claimed !== 'OK') return await failMfa(userId, ctx, 'concurrent_claim');

  try {
    if ((await redis.get(usedKey(jti))) !== null) return await failMfa(userId, ctx, 'already_used');

    const attempts = await redis.incr(attemptsKey(jti));
    if (attempts === 1) await redis.expire(attemptsKey(jti), MFA_TOKEN_TTL_SEC);
    if (attempts > MFA_MAX_ATTEMPTS) {
      await redis.set(usedKey(jti), '1', 'EX', MFA_TOKEN_TTL_SEC); // kill the token, no more attempts even with the right code
      return await failMfa(userId, ctx, 'attempts_exhausted');
    }

    const user = await adminAuthUserById(userId);
    if (!user) return await failMfa(userId, ctx, 'user_not_found');

    // Re-review finding A: a lock that tripped *during* this MFA challenge (or an earlier one for
    // the same admin) must stop every subsequent mfaToken immediately, even one issued before the
    // lock — otherwise an attacker can keep spending fresh mfaTokens (one per admin login) against
    // a locked account. Checked after loading the user (needs `lockedUntil`), before either TOTP
    // path runs, so no code guess is even attempted once locked.
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      const retryAfterSeconds = Math.max(1, Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000));
      await record({
        action: 'admin.mfa.failed',
        actorId: user.id,
        actorRole: user.role,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        metadata: { reason: 'locked', portal: 'admin' },
      });
      throw accountLocked(retryAfterSeconds, 'Too many failed sign-in attempts. Please try again later.');
    }

    // A-M4: enrolment can no longer happen here (only `scripts/create-admin.ts`, at account-
    // creation time) — an admin reaching this far with no secret means the bootstrap step was
    // skipped/corrupted; fail closed the same way `adminLogin` already does, rather than resuming
    // whatever `input.code`/`input.recoveryCode` was sent against a nonexistent secret.
    if (!user.mfaSecretEnc) return await failMfa(user.id, ctx, 'no_secret', user.role);

    await verifyEnrolledMfa(user, input, ctx);
    await redis.set(usedKey(jti), '1', 'EX', MFA_TOKEN_TTL_SEC);

    await adminAuthRepository.completeLogin(user.id);
    const session = await createSession({ userId: user.id, role: Role.ADMIN, ip: ctx.ip, userAgent: ctx.userAgent });
    const signed = await signAccessToken({ userId: user.id, role: Role.ADMIN, sessionId: session.sessionId });
    await record({ action: 'admin.login', actorId: user.id, actorRole: Role.ADMIN, ip: ctx.ip, userAgent: ctx.userAgent });

    return {
      accessToken: signed.token,
      expiresIn: signed.expiresIn,
      refreshToken: session.refreshToken,
      refreshExpiresAt: session.expiresAt,
      user,
    };
  } finally {
    await redis.del(claimLockKey(jti));
  }
}

/** Loads the user behind an MFA token and re-checks it is still an active admin (BR-AU-08). */
async function adminAuthUserById(userId: string): Promise<UserModel | null> {
  const user = await authRepository.findById(userId);
  if (!user || user.role !== Role.ADMIN || user.status !== UserStatus.ACTIVE) return null;
  return user;
}
