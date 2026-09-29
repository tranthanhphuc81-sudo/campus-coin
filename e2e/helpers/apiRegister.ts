/**
 * apiRegister.ts
 * Registers a throwaway student directly through the REST API (`POST /api/v1/auth/register`),
 * bypassing the UI/Mailpit round trip. Used only where a spec needs "a brand-new user that exists"
 * but the scenario under test isn't registration itself (e.g. the admin-portal spec, which must not
 * disable/enable one of the 5 fixed demo accounts other specs depend on).
 * Main exports: registerStudentViaApi
 * Spec: docs/spec/07 §7.3.1 (`POST /auth/register`)
 */
import type { APIRequestContext } from '@playwright/test';

/** One throwaway student account, created but never email-verified (stays `pending`). */
export interface ThrowawayStudent {
  email: string;
  password: string;
  fullName: string;
}

/**
 * Calls `POST /api/v1/auth/register` for a freshly generated, never-reused email. The account is
 * left in `pending` status (email never verified) — good enough for admin-portal read/disable
 * scenarios, which don't need the account to be able to log in.
 */
export async function registerStudentViaApi(request: APIRequestContext, baseURL: string): Promise<ThrowawayStudent> {
  const student: ThrowawayStudent = {
    email: `e2e-admin-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.com`,
    password: 'Sup3r-Str0ng-Passw0rd-2026!',
    fullName: 'E2E Throwaway Student',
  };
  const response = await request.post(`${baseURL}/api/v1/auth/register`, {
    data: { fullName: student.fullName, email: student.email, password: student.password },
  });
  if (!response.ok()) {
    throw new Error(`registerStudentViaApi failed: ${response.status()} ${await response.text()}`);
  }
  return student;
}
