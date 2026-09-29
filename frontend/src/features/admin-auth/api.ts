/**
 * api.ts
 * Thin wrappers around the two admin-login endpoints (`/admin/auth/login`,
 * `/admin/auth/mfa/verify`). Deliberately outside TanStack Query: there is no cached "admin
 * login" server state to read/invalidate, just two one-shot calls driven by the page's own
 * step state machine. TOTP enrolment happens out-of-band at `admin:create` CLI time (P19
 * A-M4), so neither response carries enrolment/recovery-code material anymore.
 * Exports: adminLogin, adminMfaVerify, AdminLoginResponse, AdminMfaVerifyResponse
 * Spec: docs/spec/09 §9.5 (admin MFA login) · API: docs/spec/07 §7.3 (auth responses)
 */
import type { AdminLoginInput } from '@campuscoin/shared';
import { apiClient, type ApiRequestConfig } from '../../lib/apiClient/apiClient';
import type { UserDto } from '../../lib/auth/types';

/** Response body of `POST /admin/auth/login`. */
export interface AdminLoginResponse {
  mfaRequired: true;
  mfaToken: string;
  expiresIn: number;
}

/** Body accepted by `POST /admin/auth/mfa/verify`: exactly one of `code` or `recoveryCode`. */
export type AdminMfaVerifyInput = { mfaToken: string } & (
  | { code: string; recoveryCode?: never }
  | { recoveryCode: string; code?: never }
);

/** Response body of `POST /admin/auth/mfa/verify`. */
export interface AdminMfaVerifyResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: UserDto;
}

/**
 * Step 1 of admin sign-in: verifies email + password.
 * @param input - `{ email, password }`, already validated client-side against `adminLoginSchema`.
 * @returns the MFA challenge (`mfaToken`) for an already-enrolled admin.
 * @throws {@link import('../../lib/apiClient/apiError').ApiError} with `type` one of
 *   `'unauthenticated'`, `'account-locked'`, `'email-not-verified'`, `'account-disabled'`.
 */
export async function adminLogin(input: AdminLoginInput): Promise<AdminLoginResponse> {
  const response = await apiClient.post<AdminLoginResponse>('/admin/auth/login', input, {
    _skipAuthRefresh: true,
  } as ApiRequestConfig);
  return response.data;
}

/**
 * Step 2 of admin sign-in: verifies the `mfaToken` challenge with a TOTP code or a recovery code.
 * @param input - `{ mfaToken, code }` or `{ mfaToken, recoveryCode }` (exactly one of the two).
 * @returns the session (`accessToken` + `user`).
 * @throws {@link import('../../lib/apiClient/apiError').ApiError} with `type` one of
 *   `'unauthenticated'` (dead/expired `mfaToken`), `'mfa-invalid'`, `'account-locked'`.
 */
export async function adminMfaVerify(input: AdminMfaVerifyInput): Promise<AdminMfaVerifyResponse> {
  const response = await apiClient.post<AdminMfaVerifyResponse>('/admin/auth/mfa/verify', input, {
    _skipAuthRefresh: true,
  } as ApiRequestConfig);
  return response.data;
}
