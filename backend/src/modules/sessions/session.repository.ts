/**
 * session.repository.ts
 * Prisma access for refresh-token sessions (`RefreshToken` model — one row per issued/rotated
 * token; `familyId` is the rotation family and doubles as the JWT `sid`). Every write that
 * targets an existing session is scoped by `userId` where it matters, and revokes use a
 * conditional `updateMany` so concurrent rotation attempts can never both "win" (reuse detection,
 * spec §5.1.2/§9.5, TC-04).
 * Main exports: sessionRepository, CreateRefreshTokenInput
 * Spec: docs/spec/09 §9.5 · Rules: BR-AU-05..08
 */
import type { Prisma } from '../../generated/prisma/client.js';
import type { AppPrismaClient } from '../../lib/prisma.js';
import { prisma } from '../../lib/prisma.js';

/** Either the shared client or a transaction handle — every method accepts both. */
type Db = AppPrismaClient | Prisma.TransactionClient;

/** Input to {@link sessionRepository.create}. */
export interface CreateRefreshTokenInput {
  userId: string;
  tokenHash: string;
  familyId: string;
  userAgent?: string;
  ipHash?: string;
  expiresAt: Date;
}

/** Data-access functions for `refresh_tokens`, all callable inside or outside a transaction. */
export const sessionRepository = {
  /** Inserts a new refresh-token row (the SHA-256 hash only, never the plaintext token). */
  create(input: CreateRefreshTokenInput, db: Db = prisma) {
    return db.refreshToken.create({ data: input });
  },

  /** Looks up a session by the token's SHA-256 hash (unique). */
  findByHash(tokenHash: string, db: Db = prisma) {
    return db.refreshToken.findUnique({ where: { tokenHash } });
  },

  /** Records which token replaced `id` on rotation. */
  markReplaced(id: string, replacedById: string, db: Db = prisma) {
    return db.refreshToken.update({ where: { id }, data: { replacedById } });
  },

  /** Race-safe revoke of one row: only succeeds if it was not already revoked. */
  revokeById(id: string, now: Date, db: Db = prisma) {
    return db.refreshToken.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: now } });
  },

  /** Revokes every still-active token in a rotation family (reuse detection / forced logout). */
  revokeFamily(familyId: string, now: Date, db: Db = prisma) {
    return db.refreshToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: now } });
  },

  /** Revokes one family, scoped by `userId` so a caller can never revoke another user's session. */
  revokeFamilyForUser(userId: string, familyId: string, now: Date, db: Db = prisma) {
    return db.refreshToken.updateMany({ where: { userId, familyId, revokedAt: null }, data: { revokedAt: now } });
  },

  /** Revokes every active session of a user, optionally keeping one family alive. */
  revokeAllForUser(userId: string, now: Date, exceptFamilyId: string | undefined, db: Db = prisma) {
    return db.refreshToken.updateMany({
      where: { userId, revokedAt: null, ...(exceptFamilyId ? { familyId: { not: exceptFamilyId } } : {}) },
      data: { revokedAt: now },
    });
  },

  /** True when a family has at least one unrevoked, unexpired token (DB fallback for Redis outage). */
  hasActiveFamily(familyId: string, now: Date, db: Db = prisma) {
    return db.refreshToken.findFirst({ where: { familyId, revokedAt: null, expiresAt: { gt: now } } });
  },

  /** Confirms `familyId` was issued to `userId` (ownership check before a manual revoke). */
  familyBelongsToUser(userId: string, familyId: string, db: Db = prisma) {
    return db.refreshToken.findFirst({ where: { userId, familyId } });
  },

  /** One row per currently-active family for a user (newest first) — "manage devices" (block C). */
  listActiveSessions(userId: string, now: Date, db: Db = prisma) {
    return db.refreshToken.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
    });
  },

  /**
   * Earliest `createdAt` per family (the family's true start, before any rotation) — a family's
   * *active* row only tells you when it was last rotated, not when the session began.
   */
  async familyStartTimes(userId: string, familyIds: string[], db: Db = prisma): Promise<Map<string, Date>> {
    if (familyIds.length === 0) return new Map();
    const rows = await db.refreshToken.groupBy({
      by: ['familyId'],
      where: { userId, familyId: { in: familyIds } },
      _min: { createdAt: true },
    });
    return new Map(rows.map((r) => [r.familyId, r._min.createdAt as Date]));
  },

  /** Earliest `createdAt` of one family — used to cap a student's sliding refresh expiry (BR-AU-05). */
  async familyStart(familyId: string, db: Db = prisma): Promise<Date | undefined> {
    const row = await db.refreshToken.aggregate({ where: { familyId }, _min: { createdAt: true } });
    return row._min.createdAt ?? undefined;
  },
};
