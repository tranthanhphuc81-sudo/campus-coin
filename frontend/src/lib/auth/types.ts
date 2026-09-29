/**
 * types.ts
 * Local mirror of the backend `UserDto` (not yet exported from `@campuscoin/shared`). Keep in
 * sync with the P04 auth/`/me` response shape.
 * Exports: UserPreferences, UserDto
 * Spec: docs/spec/07 §7.3 (auth responses) · P04 backend user serialization
 */
import type { AcademicYear, CurrencyCode, Role, UserStatus } from '@campuscoin/shared';

/** Partial JSON preferences blob stored on the user (theme/fontScale/locale). */
export interface UserPreferences {
  theme?: 'light' | 'dark' | 'system';
  fontScale?: number;
  locale?: 'en';
}

/** Authenticated user as returned by `/auth/login`, `/auth/refresh` and `/me`. */
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
  preferences: UserPreferences | null;
  aiOptIn: boolean;
  emailVerifiedAt: string | null;
  createdAt: string;
  mfaEnabled: boolean;
}
