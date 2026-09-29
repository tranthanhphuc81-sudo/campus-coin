/**
 * totp.ts
 * TOTP (RFC 6238) helpers for admin MFA, built on otplib v13's functional API (default
 * sha1/6-digits/30s period, Base32 secrets — Google Authenticator / Authy compatible).
 * `verifyTotp` applies a ±1 time-step tolerance and otplib's own `afterTimeStep` replay guard
 * (rejects a time step at or before the last one this admin already used).
 * Main exports: generateTotpSecret, buildOtpauthUrl, verifyTotp, generateTotpCode, TOTP_PERIOD_SEC,
 *               TOTP_LAST_STEP_TTL_SEC
 * Spec: docs/spec/09 §9.5 (MFA row), §9.7 · Rules: BR-AU-09 (admin MFA)
 */
import { generate, generateSecret, generateURI, verify } from 'otplib';

/** Fixed issuer shown in the authenticator app (otpauth:// URI label prefix). */
const ISSUER = 'CampusCoin';

/** otplib default TOTP period, in seconds — kept explicit here since `epochTolerance` is expressed in seconds. */
export const TOTP_PERIOD_SEC = 30;

/** Redis TTL for `mfa:last-step:{userId}` — a few steps past the last accepted one, not just one. */
export const TOTP_LAST_STEP_TTL_SEC = TOTP_PERIOD_SEC * 3;

/** Generates a fresh random Base32 TOTP secret (160-bit, otplib default) for a new enrolment. */
export function generateTotpSecret(): string {
  return generateSecret();
}

/**
 * Builds the `otpauth://totp/...` URI an authenticator app scans as a QR code.
 * @param secret - Base32 TOTP secret.
 * @param email - Account email, used as the URI label (issuer is always fixed to `ISSUER`).
 */
export function buildOtpauthUrl(secret: string, email: string): string {
  return generateURI({ issuer: ISSUER, label: email, secret });
}

/** Result of {@link verifyTotp}. */
export interface VerifyTotpResult {
  valid: boolean;
  /** RFC 6238 time-step counter the code matched at — present only when `valid`. Used for replay protection. */
  timeStep?: number;
}

/**
 * Verifies a 6-digit TOTP code against `secret`.
 * @param secret - Base32 TOTP secret (decrypted from `users.mfaSecretEnc`, or the pending enrolment secret).
 * @param code - The 6-digit code the admin typed.
 * @param afterTimeStep - When set, otplib rejects a match at or before this time step (replay
 *   protection) — pass the last accepted step for this user, read from Redis.
 */
export async function verifyTotp(secret: string, code: string, afterTimeStep?: number): Promise<VerifyTotpResult> {
  const result = await verify({
    secret,
    token: code,
    epochTolerance: TOTP_PERIOD_SEC, // BR-AU-09: accept ±1 time-step of clock drift
    ...(afterTimeStep !== undefined ? { afterTimeStep } : {}),
  });
  if (!result.valid) return { valid: false };
  // Always the TOTP branch of the result union (no `strategy` option is ever passed) — the
  // functional API's return type is still the generic TOTP|HOTP union, so narrow explicitly.
  return { valid: true, timeStep: (result as { timeStep: number }).timeStep };
}

/**
 * Generates the CURRENT 6-digit TOTP code for `secret` (P17: printed at demo-seed time so an
 * operator can type it in without scanning the QR code live).
 * @param secret - Base32 TOTP secret.
 * @returns The 6-digit code valid for the current time step.
 */
export async function generateTotpCode(secret: string): Promise<string> {
  return generate({ secret });
}
