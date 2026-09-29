/**
 * users.mapper.ts
 * Maps a Prisma `User` row to the public-safe DTO returned by the API. Never includes
 * `passwordHash`, `mfaSecretEnc`, `mfaRecoveryCodes`, `failedLoginCount` or `lockedUntil` — the
 * mapper's field list is the whitelist, so a new sensitive column added later can't leak by
 * accident (CLAUDE.md security invariant: never over-select onto the wire).
 * Main exports: toUserDto, UserDto
 * Spec: docs/spec/07 §7.3.1 (user DTO)
 */
import type { AcademicYear, CurrencyCode, Role, UserStatus } from '@campuscoin/shared';
import type { UserModel } from '../../generated/prisma/models/User.js';
import { toMoneyString } from '../../lib/money.js';

/** Public-safe shape of a `User`, returned from `/auth/*` and `/users/me`. */
export interface UserDto {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  status: UserStatus;
  academicYear: AcademicYear | null;
  monthlyAllowanceBaseline: string | null;
  monthlySavingsGoal: string | null;
  currency: CurrencyCode;
  timezone: string;
  preferences: unknown;
  aiOptIn: boolean;
  emailVerifiedAt: string | null;
  createdAt: string;
  /** Derived from `mfaSecretEnc` presence — never expose the secret itself. */
  mfaEnabled: boolean;
}

/**
 * Converts a Prisma `User` row into the public {@link UserDto}.
 * @param user - Full row, as read from the DB (never partially selected — this mapper does the whitelisting).
 */
export function toUserDto(user: UserModel): UserDto {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role as Role,
    status: user.status as UserStatus,
    academicYear: (user.academicYear as AcademicYear | null) ?? null,
    monthlyAllowanceBaseline: user.monthlyAllowanceBaseline ? toMoneyString(user.monthlyAllowanceBaseline) : null,
    monthlySavingsGoal: user.monthlySavingsGoal ? toMoneyString(user.monthlySavingsGoal) : null,
    currency: user.currency as CurrencyCode,
    timezone: user.timezone,
    preferences: user.preferences,
    aiOptIn: user.aiOptIn,
    emailVerifiedAt: user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null,
    createdAt: user.createdAt.toISOString(),
    mfaEnabled: user.mfaSecretEnc !== null,
  };
}
