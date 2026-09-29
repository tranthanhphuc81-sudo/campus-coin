/**
 * adminUser.ts
 * Zod schema + DTOs for the admin portal's user-management endpoints (search/list/detail). The
 * list DTO only ever carries a masked email (`backend/src/lib/maskEmail.ts`); the full email is
 * only exposed on the single-user detail DTO, and only a transaction COUNT — never transaction
 * content (CLAUDE.md: admin never reads a student's financial detail).
 * Main exports: listAdminUsersQuerySchema + inferred input type, AdminUserListItemDto,
 *   AdminUserDetailDto
 * Spec: docs/spec/05c §5.13 · docs/spec/07 §7.3.4
 */
import { z } from 'zod';
import { UserStatus } from '../enums.js';
import { EMAIL_MAX_LENGTH, PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX } from '../constants.js';

/** Query of `GET /admin/users`. */
export const listAdminUsersQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(EMAIL_MAX_LENGTH).optional(),
    status: z.enum(UserStatus).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(PAGE_SIZE_DEFAULT),
  })
  .strict();
/** Inferred input type of {@link listAdminUsersQuerySchema}. */
export type ListAdminUsersQueryInput = z.infer<typeof listAdminUsersQuerySchema>;

/** One row of `GET /admin/users` — email is masked (never the full address in a list view). */
export interface AdminUserListItemDto {
  id: string;
  fullName: string;
  maskedEmail: string;
  status: UserStatus;
  createdAt: string;
}

/** Shape of `GET /admin/users/:id` — full email, but only a transaction COUNT, never content. */
export interface AdminUserDetailDto {
  id: string;
  fullName: string;
  email: string;
  status: UserStatus;
  createdAt: string;
  lastLoginAt: string | null;
  transactionCount: number;
}
