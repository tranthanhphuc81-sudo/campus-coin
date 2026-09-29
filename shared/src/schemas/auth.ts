/**
 * auth.ts
 * Zod schemas for the authentication module (register/login/verify/reset/MFA/profile), shared
 * between the backend API edge and the frontend forms (React Hook Form). Every body schema is
 * `.strict()` so unexpected fields — in particular `role`, `status`, `userId` — are rejected with
 * a 422 instead of silently ignored (BR-AU-01: mass-assignment protection).
 * Main exports: emailSchema, passwordSchema, registerSchema, loginSchema, verifyEmailSchema,
 *   emailOnlySchema, resetPasswordSchema, changePasswordSchema, adminLoginSchema,
 *   mfaVerifySchema, mfaTokenSchema, updateProfileSchema, tokenSchema + inferred *Input types
 * Spec: docs/spec/09 §9 (auth) · Rules: BR-AU-01 (email), BR-AU-02 (password policy) ·
 *   docs/security/review-p19.md C-L4 (fullName control-character rejection)
 */
import { z } from 'zod';
import { AcademicYear, CurrencyCode } from '../enums.js';
import { EMAIL_MAX_LENGTH, FULL_NAME_MAX_LENGTH, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../constants.js';

/** Plain decimal string accepted for money-like profile fields (no sign, up to 12 integer digits). */
// Bounded digit counts (max 12 + max 2), so this cannot backtrack catastrophically.
// eslint-disable-next-line security/detect-unsafe-regex
const MONEY_STRING = /^\d{1,12}(\.\d{1,2})?$/;
/** A 6-digit TOTP code. */
const TOTP_CODE = /^\d{6}$/;
/** base64url(32 random bytes) — exactly 43 characters, no padding. */
const BASE64URL_32_BYTES = /^[A-Za-z0-9_-]{43}$/;
// C-L4: ASCII control characters (incl. CR/LF/NUL) rejected in `fullName` — otherwise a display
// name can inject fake paragraph breaks into the plaintext part of an email built from it (e.g.
// the shared-report email's greeting), a phishing vector since that email is sent from
// CampusCoin's own trusted domain. See docs/security/review-p19.md C-L4/B-L7.
// eslint-disable-next-line no-control-regex -- intentional: this IS the control-char filter.
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;
/** Compact JWT shape: three base64url segments separated by dots (used by the admin `mfaToken`). */
const COMPACT_JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/**
 * Email address: trimmed, lower-cased, max {@link EMAIL_MAX_LENGTH}. BR-AU-01: addresses are
 * always compared/stored lower-case so `Foo@Bar.com` and `foo@bar.com` are the same account.
 */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(EMAIL_MAX_LENGTH, `Email must be at most ${EMAIL_MAX_LENGTH} characters.`)
  .pipe(z.email('Enter a valid email address.'));

/**
 * Password shape only (length). Blocklist/breach/contains-email checks run server-side
 * (`backend/src/lib/passwordPolicy.ts`) because they need I/O (wordlist, HIBP) — BR-AU-02.
 */
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`);

/** A generic opaque token as sent in emails/links: base64url of 32 random bytes. */
export const tokenSchema = z
  .string()
  .regex(BASE64URL_32_BYTES, 'Malformed token.');

/** The admin MFA challenge token — a signed compact JWT (`lib/jwt.ts` `signMfaToken`), not an opaque link token. */
export const mfaTokenSchema = z
  .string()
  .max(2000, 'Malformed MFA token.')
  .regex(COMPACT_JWT, 'Malformed MFA token.');

/** Body of `POST /auth/register`. */
export const registerSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, 'Full name must be at least 2 characters.')
      .max(FULL_NAME_MAX_LENGTH, `Full name must be at most ${FULL_NAME_MAX_LENGTH} characters.`)
      // BR-AU-01/C-L4: reject control characters (see CONTROL_CHARS above).
      .refine((v) => !CONTROL_CHARS.test(v), 'Full name must not contain control characters.'),
    email: emailSchema,
    password: passwordSchema,
  })
  .strict();
/** Inferred input type of {@link registerSchema}. */
export type RegisterInput = z.infer<typeof registerSchema>;

/** Body of `POST /auth/login`. Login never re-validates the password *policy* — only presence. */
export const loginSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1, 'Password is required.').max(PASSWORD_MAX_LENGTH),
    rememberMe: z.boolean().optional().default(false),
  })
  .strict();
/** Inferred input type of {@link loginSchema}. */
export type LoginInput = z.infer<typeof loginSchema>;

/** Body of `POST /auth/verify-email`. */
export const verifyEmailSchema = z.object({ token: tokenSchema }).strict();
/** Inferred input type of {@link verifyEmailSchema}. */
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

/** Body shared by "resend verification" and "forgot password" — just an email. */
export const emailOnlySchema = z.object({ email: emailSchema }).strict();
/** Inferred input type of {@link emailOnlySchema}. */
export type EmailOnlyInput = z.infer<typeof emailOnlySchema>;

/** Body of `POST /auth/reset-password`. */
export const resetPasswordSchema = z
  .object({ token: tokenSchema, newPassword: passwordSchema })
  .strict();
/** Inferred input type of {@link resetPasswordSchema}. */
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/** Body of `POST /auth/change-password` (authenticated). */
export const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH), newPassword: passwordSchema })
  .strict();
/** Inferred input type of {@link changePasswordSchema}. */
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** Body of `POST /admin/auth/login`. */
export const adminLoginSchema = z
  .object({ email: emailSchema, password: z.string().min(1).max(PASSWORD_MAX_LENGTH) })
  .strict();
/** Inferred input type of {@link adminLoginSchema}. */
export type AdminLoginInput = z.infer<typeof adminLoginSchema>;

/**
 * Body of `POST /auth/mfa/verify` (and admin equivalent). Exactly one of `code` (TOTP) or
 * `recoveryCode` must be present.
 */
export const mfaVerifySchema = z
  .object({
    mfaToken: mfaTokenSchema,
    code: z.string().regex(TOTP_CODE, 'Code must be 6 digits.').optional(),
    recoveryCode: z.string().trim().min(1).max(64).optional(),
  })
  .strict()
  .refine((v) => Boolean(v.code) !== Boolean(v.recoveryCode), {
    message: 'Provide exactly one of code or recoveryCode.',
  });
/** Inferred input type of {@link mfaVerifySchema}. */
export type MfaVerifyInput = z.infer<typeof mfaVerifySchema>;

/** Strips HTML tags from a display name (defence in depth; React never renders raw HTML anyway). */
function stripHtmlTags(value: string): string {
  return value.replace(/<[^>]*>/g, '').trim();
}

/** Validates an IANA timezone name using the runtime's own tz database. */
function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Money-like string field (nullable, optional): allowance baseline / savings goal. */
const nullableMoneyString = z
  .string()
  .regex(MONEY_STRING, 'Must be a plain decimal amount, e.g. "250.00".')
  .nullable()
  .optional();

/**
 * Body of `PATCH /users/me` (profile settings). `.strict()` whitelist: any client attempt to
 * set `role`, `status` or `userId` is rejected with 422 instead of ignored (BR-AU-01).
 */
export const updateProfileSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .transform(stripHtmlTags)
      // C-L4: same control-character rejection as registerSchema.fullName — a profile edit is
      // another way this field ends up in the shared-report email's greeting.
      .pipe(z.string().min(2).max(FULL_NAME_MAX_LENGTH).refine((v) => !CONTROL_CHARS.test(v), 'Full name must not contain control characters.'))
      .optional(),
    academicYear: z.enum(AcademicYear).nullable().optional(),
    monthlyAllowanceBaseline: nullableMoneyString,
    monthlySavingsGoal: nullableMoneyString,
    currency: z.enum(CurrencyCode).optional(),
    timezone: z
      .string()
      .refine(isValidTimezone, 'Unknown timezone.')
      .optional(),
    preferences: z
      .object({
        theme: z.enum(['light', 'dark', 'system']),
        fontScale: z.number().min(0.875).max(1.5),
        locale: z.literal('en'),
      })
      .partial()
      .strict()
      .optional(),
    aiOptIn: z.boolean().optional(),
  })
  .strict();
/** Inferred input type of {@link updateProfileSchema}. */
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
