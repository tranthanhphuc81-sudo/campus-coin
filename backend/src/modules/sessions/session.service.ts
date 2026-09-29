/**
 * session.service.ts
 * Refresh-token session lifecycle: create, rotate (with reuse detection), revoke one/all, and a
 * cheap Redis-backed "is this session still alive" check used by `authenticate` on every request.
 * `sid` (the JWT `sid` claim) = `RefreshToken.familyId`: rotation keeps the same family, so
 * revoking a family kills every access token minted under any of its rotations immediately (via
 * the `auth:revoked-sid:{familyId}` Redis marker), even though the JWT itself stays "valid" until
 * it expires.
 * Main exports: createSession, rotate, revokeSession, revokeAllSessions, isSessionActive,
 *   listSessions, revokeSessionByToken
 * Spec: docs/spec/09 §9.5, §9.7 · Rules: BR-AU-05 (rotation), BR-AU-07 (admin idle timeout),
 *   BR-AU-08 (non-active user loses sessions). Reuse detection is spec §5.1.2/§9.5 (TC-04), not a BR code.
 */
import { randomUUID } from 'node:crypto';
import type { RefreshTokenModel } from '../../generated/prisma/models/RefreshToken.js';
import {
  ACCESS_TOKEN_TTL_SEC,
  ADMIN_IDLE_TIMEOUT_MS,
  ADMIN_REFRESH_TTL_MS,
  REFRESH_TTL_MS,
  REFRESH_TTL_REMEMBER_MS,
  Role,
  UserStatus,
  type Role as RoleType,
} from '@campuscoin/shared';
import { hashIp, record } from '../audit/audit.service.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { unauthenticated } from '../../lib/problem.js';
import { redis } from '../../lib/redis.js';
import { truncate } from '../../lib/strings.js';
import { generateToken, sha256Hex } from '../../lib/tokens.js';
import { sessionRepository } from './session.repository.js';

/** Max length of `refresh_tokens.user_agent` (VarChar(255)). */
const USER_AGENT_MAX_LENGTH = 255;
/** Redis revoked-session marker TTL: the longest-lived access token that could still be presented. */
const REVOKED_SID_TTL_SEC = ACCESS_TOKEN_TTL_SEC;

/** Redis key marking a session family as revoked (presence = revoked). */
function revokedSidKey(familyId: string): string {
  return `auth:revoked-sid:${familyId}`;
}

/**
 * Marks a family revoked in Redis so already-issued access tokens die immediately. The DB revoke
 * (always written first by every caller) is the source of truth — a Redis outage must never make
 * a revoke look like it failed, so this only logs and swallows the error (security review).
 */
async function markRevokedInRedis(familyId: string): Promise<void> {
  try {
    await redis.set(revokedSidKey(familyId), '1', 'EX', REVOKED_SID_TTL_SEC);
  } catch (err) {
    logger.error({ err, familyId }, '[session] failed to mark family revoked in Redis (DB revoke is authoritative)');
  }
}

/** Truncates a User-Agent header to fit the DB column. */
function truncateUserAgent(userAgent?: string): string | undefined {
  return truncate(userAgent, USER_AGENT_MAX_LENGTH);
}

/** Request context carried through session creation/rotation for audit + IP hashing. */
export interface SessionContext {
  userAgent?: string;
  ip?: string;
  /**
   * Set only when an admin triggers a student-facing flow on a user's behalf (e.g.
   * `admin-users.service.sendResetLink`) — the acting admin's user id, so the resulting audit row
   * is attributed to whoever actually initiated the action, not silently misread as the target
   * user's own request (security-fix follow-up, Fix 4). Left `undefined` for every normal,
   * self-initiated student flow.
   */
  initiatedBy?: string;
}

/** Input to {@link createSession}. */
export interface CreateSessionInput extends SessionContext {
  userId: string;
  role: RoleType;
  rememberMe?: boolean;
}

/** Result of {@link createSession}/{@link rotate}: the plaintext token to hand to the client. */
export interface SessionResult {
  refreshToken: string;
  sessionId: string;
  expiresAt: Date;
}

/** Computes the initial refresh-token expiry for a brand-new session. */
function initialExpiry(role: RoleType, rememberMe: boolean, now: Date): Date {
  if (role === Role.ADMIN) return new Date(now.getTime() + ADMIN_REFRESH_TTL_MS);
  return new Date(now.getTime() + (rememberMe ? REFRESH_TTL_REMEMBER_MS : REFRESH_TTL_MS));
}

/**
 * Starts a new session (a new rotation family) for `input.userId`. Only the token's SHA-256 hash
 * is persisted — BR-AU-04.
 * @returns The plaintext refresh token, the session id (family id) and its expiry.
 */
export async function createSession(input: CreateSessionInput): Promise<SessionResult> {
  const now = new Date();
  const familyId = randomUUID();
  const token = generateToken();
  const expiresAt = initialExpiry(input.role, input.rememberMe ?? false, now);

  await sessionRepository.create({
    userId: input.userId,
    tokenHash: sha256Hex(token),
    familyId,
    userAgent: truncateUserAgent(input.userAgent),
    ipHash: input.ip ? hashIp(input.ip) : undefined,
    expiresAt,
  });

  return { refreshToken: token, sessionId: familyId, expiresAt };
}

/** Result of {@link rotate}: the new session plus the minimal user fields needed to sign a token. */
export interface RotateResult extends SessionResult {
  user: { id: string; role: RoleType; status: string };
}

/**
 * Revokes a whole family (DB + Redis), audits a reuse detection, then throws 401. Deliberately
 * NOT run inside {@link rotate}'s atomic-rotation transaction: a revoke followed by a `throw`
 * inside `prisma.$transaction` would roll the revoke back too, silently un-revoking the family —
 * this must always commit on its own.
 */
async function revokeFamilyAsReuse(familyId: string, userId: string, now: Date, ctx: SessionContext): Promise<never> {
  await sessionRepository.revokeFamily(familyId, now);
  await markRevokedInRedis(familyId);
  await record({
    action: 'auth.refresh.reuse_detected',
    actorId: userId,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    metadata: { familyId },
  });
  throw unauthenticated('Refresh token has already been used');
}

/**
 * Rotates a refresh token: validates it, detects reuse (spec §5.1.2/§9.5, TC-04 — revokes the
 * whole family and audits `auth.refresh.reuse_detected`), enforces the admin idle timeout (BR-AU-07) / student
 * sliding expiry, and issues a same-family replacement. Only the final "revoke old + insert new +
 * link replacedById" step runs inside a transaction (the minimal atomic unit needed to make
 * concurrent rotation attempts race-safe); every other check/revoke commits independently so a
 * later `throw` in this function can never undo it.
 * @param rawToken - Plaintext refresh token read from the cookie.
 * @param ctx - Caller's User-Agent/IP, used for the new token row and reuse audit.
 * @throws {AppError} 401 on a missing/expired/reused/revoked token or a non-active user.
 */
export async function rotate(rawToken: string, ctx: SessionContext = {}): Promise<RotateResult> {
  const tokenHash = sha256Hex(rawToken);
  const now = new Date();

  const existing = await sessionRepository.findByHash(tokenHash);
  if (!existing) throw unauthenticated('Refresh token is invalid');

  // Reuse detection (spec §5.1.2/§9.5, TC-04): reuse of an already-rotated/revoked token revokes the whole family.
  if (existing.revokedAt !== null || existing.replacedById !== null) {
    await revokeFamilyAsReuse(existing.familyId, existing.userId, now, ctx);
  }

  if (existing.expiresAt.getTime() <= now.getTime()) {
    throw unauthenticated('Refresh token has expired');
  }

  const user = await prisma.user.findUnique({ where: { id: existing.userId } });
  if (!user || user.status !== UserStatus.ACTIVE) {
    // BR-AU-08: a non-active account loses every session immediately.
    await sessionRepository.revokeFamily(existing.familyId, now);
    await markRevokedInRedis(existing.familyId);
    throw unauthenticated('Account is not active');
  }

  let expiresAt: Date;
  if (user.role === Role.ADMIN) {
    // BR-AU-07: idle timeout measured from when this specific token was minted.
    if (now.getTime() - existing.createdAt.getTime() > ADMIN_IDLE_TIMEOUT_MS) {
      await sessionRepository.revokeFamily(existing.familyId, now);
      await markRevokedInRedis(existing.familyId);
      throw unauthenticated('Session has been idle for too long');
    }
    expiresAt = existing.expiresAt; // absolute 8h family lifetime — unchanged on rotation
  } else {
    // Student: sliding window, same length as the token that was just presented, but never past
    // the family's absolute cap (BR-AU-05: an endlessly-refreshed session must still expire).
    const originalTtlMs = existing.expiresAt.getTime() - existing.createdAt.getTime();
    const slidingExpiresAt = now.getTime() + originalTtlMs;
    const familyStart = (await sessionRepository.familyStart(existing.familyId)) ?? existing.createdAt;
    const absoluteCap = familyStart.getTime() + REFRESH_TTL_REMEMBER_MS;
    expiresAt = new Date(Math.min(slidingExpiresAt, absoluteCap));
  }

  const nextToken = generateToken();
  // Race safety: conditionally revoke the presented row, then insert its replacement, atomically.
  // If another request already revoked this exact row between our SELECT and here, `revoked.count`
  // is 0 and nothing else in this transaction is written — the caller treats that like reuse.
  const created = await prisma.$transaction(async (tx) => {
    const revoked = await sessionRepository.revokeById(existing.id, now, tx);
    if (revoked.count === 0) return null;
    const row = await sessionRepository.create(
      {
        userId: existing.userId,
        tokenHash: sha256Hex(nextToken),
        familyId: existing.familyId,
        userAgent: truncateUserAgent(ctx.userAgent),
        ipHash: ctx.ip ? hashIp(ctx.ip) : undefined,
        expiresAt,
      },
      tx,
    );
    await sessionRepository.markReplaced(existing.id, row.id, tx);
    return row;
  });

  if (!created) {
    await revokeFamilyAsReuse(existing.familyId, existing.userId, now, ctx);
  }

  return {
    refreshToken: nextToken,
    sessionId: existing.familyId,
    expiresAt,
    user: { id: user.id, role: user.role, status: user.status },
  };
}

/**
 * Revokes one session (family) belonging to `userId`. Scoped by `userId`: returns `false` when
 * the family does not belong to this user (or doesn't exist) so the caller can respond 404
 * without revealing whether the family exists at all.
 */
export async function revokeSession(userId: string, familyId: string): Promise<boolean> {
  const owned = await sessionRepository.familyBelongsToUser(userId, familyId);
  if (!owned) return false;
  await sessionRepository.revokeFamilyForUser(userId, familyId, new Date());
  await markRevokedInRedis(familyId);
  return true;
}

/** Options for {@link revokeAllSessions}. */
export interface RevokeAllOptions {
  /** Keep this one family alive (e.g. the session making the "logout everywhere else" call). */
  exceptFamilyId?: string;
}

/** Revokes every active session of `userId` ("logout everywhere"), optionally keeping one alive. */
export async function revokeAllSessions(userId: string, options: RevokeAllOptions = {}): Promise<void> {
  const now = new Date();
  const families: RefreshTokenModel[] = await sessionRepository.listActiveSessions(userId, now);
  await sessionRepository.revokeAllForUser(userId, now, options.exceptFamilyId);
  await Promise.all(
    families
      .filter((f) => f.familyId !== options.exceptFamilyId)
      .map((f) => markRevokedInRedis(f.familyId)),
  );
}

/**
 * Tells whether `sid` (a JWT `sid` claim) is still an active session. Checks Redis first — absent
 * key means active, so the common case is a single GET — and only falls back to the DB when
 * Redis itself errors (an unrevoked family always has exactly one current unrevoked/unexpired
 * row, so this correctly covers rotated families too).
 */
export async function isSessionActive(sid: string): Promise<boolean> {
  try {
    const revoked = await redis.get(revokedSidKey(sid));
    return revoked === null;
  } catch (err) {
    logger.warn({ err, sid }, '[session] Redis unavailable, falling back to DB for session check');
    const active = await sessionRepository.hasActiveFamily(sid, new Date());
    return Boolean(active);
  }
}

/** One active session ("manage devices" — block C): one entry per rotation family. */
export interface SessionSummary {
  /** Rotation family id — also the JWT `sid` claim and the id used to revoke this session. */
  familyId: string;
  userAgent: string | null;
  /** When this family was first created (survives every later rotation). */
  createdAt: Date;
  /** When the family's current (active) token was minted — i.e. last refresh activity. */
  lastUsedAt: Date;
  expiresAt: Date;
}

/**
 * Lists a user's currently-active sessions ("manage devices" — block C): one row per rotation
 * family, since {@link sessionRepository.listActiveSessions} already returns exactly one
 * unrevoked/unexpired row per family (every earlier rotation of that family was revoked).
 */
export async function listSessions(userId: string): Promise<SessionSummary[]> {
  const now = new Date();
  const active = await sessionRepository.listActiveSessions(userId, now);
  const starts = await sessionRepository.familyStartTimes(userId, active.map((a) => a.familyId));
  return active.map((a) => ({
    familyId: a.familyId,
    userAgent: a.userAgent,
    createdAt: starts.get(a.familyId) ?? a.createdAt,
    lastUsedAt: a.createdAt,
    expiresAt: a.expiresAt,
  }));
}

/**
 * Revokes the session identified by a raw refresh-token cookie value (logout). Unknown/expired
 * tokens are silently ignored — logout must never fail just because the cookie was stale.
 * @returns The owning user/family, or `null` when no such token exists.
 */
export async function revokeSessionByToken(rawToken: string): Promise<{ userId: string; familyId: string } | null> {
  const existing = await sessionRepository.findByHash(sha256Hex(rawToken));
  if (!existing) return null;
  await sessionRepository.revokeFamily(existing.familyId, new Date());
  await markRevokedInRedis(existing.familyId);
  return { userId: existing.userId, familyId: existing.familyId };
}
