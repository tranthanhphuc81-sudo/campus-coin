/**
 * admin-users.repository.ts
 * Prisma access for the admin portal's user list/search/detail and status changes. Search is a
 * case-insensitive `contains` on `fullName`/`email` — the table's default collation
 * (`utf8mb4_0900_ai_ci`) is already case-insensitive, matching `bookmarks.repository.ts`'s own note.
 * Main exports: adminUsersRepository, ListAdminUsersFilters
 * Spec: docs/spec/05c §5.13
 */
import { Role, type UserStatus } from '@campuscoin/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import type { UserModel } from '../../generated/prisma/models/User.js';
import type { AppPrismaClient } from '../../lib/prisma.js';
import { prisma } from '../../lib/prisma.js';

/** Optional filters accepted by {@link adminUsersRepository.list}/{@link adminUsersRepository.count}. */
export interface ListAdminUsersFilters {
  q?: string;
  status?: UserStatus;
}

/**
 * Builds the `where` clause shared by every query below. This feature manages STUDENT accounts
 * only (Fix 2, security-fix follow-up): scoping `role: Role.STUDENT` here — the single source of
 * truth — means an admin account is never visible or targetable through `/admin/users`, and
 * `findById`/`setStatus` on an admin id naturally 404 (matching this project's existing
 * cross-tenant "404, not 403" convention) without a separate role-comparison branch in the service.
 */
function buildWhere(filters: ListAdminUsersFilters): Prisma.UserWhereInput {
  return {
    role: Role.STUDENT,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.q ? { OR: [{ fullName: { contains: filters.q } }, { email: { contains: filters.q } }] } : {}),
  };
}

export const adminUsersRepository = {
  /** One page of users matching `filters`, newest-created first. */
  list(filters: ListAdminUsersFilters, skip: number, take: number, db: AppPrismaClient = prisma): Promise<UserModel[]> {
    return db.user.findMany({ where: buildWhere(filters), orderBy: { createdAt: 'desc' }, skip, take });
  },

  /** Count matching `list`'s filters, for pagination `meta`. */
  count(filters: ListAdminUsersFilters, db: AppPrismaClient = prisma): Promise<number> {
    return db.user.count({ where: buildWhere(filters) });
  },

  /** `null` for an unknown id OR an admin id (Fix 2: students only). */
  findById(id: string, db: AppPrismaClient = prisma): Promise<UserModel | null> {
    return db.user.findFirst({ where: { id, role: Role.STUDENT } });
  },

  /** Number of the user's non-deleted transactions — never their content (CLAUDE.md data minimisation). */
  countTransactions(userId: string, db: AppPrismaClient = prisma): Promise<number> {
    return db.transaction.count({ where: { userId, deletedAt: null } });
  },

  /** No-op (0 rows updated) for an admin id, since the `where` never matches one (Fix 2). */
  setStatus(id: string, status: UserStatus, db: AppPrismaClient = prisma): Promise<Prisma.BatchPayload> {
    return db.user.updateMany({ where: { id, role: Role.STUDENT }, data: { status } });
  },

  /**
   * Re-activates a user AND clears `deletedAt` (P16: cancels a pending `DELETE /me` self-deletion
   * — otherwise the `cleanup.expired` job would still purge the account 30 days after the original
   * request, even though an admin just re-enabled it).
   */
  setStatusAndClearDeletion(id: string, status: UserStatus, db: AppPrismaClient = prisma): Promise<Prisma.BatchPayload> {
    return db.user.updateMany({ where: { id, role: Role.STUDENT }, data: { status, deletedAt: null } });
  },
};
