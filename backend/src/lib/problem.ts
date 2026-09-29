/**
 * problem.ts
 * RFC 9457 "Problem Details" error type used by every API response. `AppError` carries enough
 * to render `application/problem+json`; the factories below cover every error family in
 * docs/spec/07 §7.2 (Table 41). `errorHandler` (middlewares/errorHandler.ts) is the only place
 * that turns an `AppError` into an HTTP response.
 * Main exports: ProblemType, FieldError, AppError, badRequest, unauthenticated, forbidden,
 *               notFound, conflict, versionMismatch, payloadTooLarge, unsupportedMediaType,
 *               validationFailed, rateLimited, internal, serviceUnavailable, invalidToken,
 *               accountLocked, emailNotVerified, accountDisabled, mfaInvalid
 * Spec: docs/spec/07 §7.2 (Table 41) · docs/spec/09 §9.4 (no stack traces/SQL in errors)
 */

/** Machine-readable error slugs from docs/spec/07 Table 41. */
export type ProblemType =
  | 'bad-request'
  | 'unauthenticated'
  | 'token-expired'
  | 'forbidden'
  | 'not-found'
  | 'conflict'
  | 'version-mismatch'
  | 'payload-too-large'
  | 'unsupported-media-type'
  | 'validation-failed'
  | 'rate-limited'
  | 'internal-error'
  | 'service-unavailable'
  | 'invalid-token'
  | 'account-locked'
  | 'email-not-verified'
  | 'account-disabled'
  | 'mfa-invalid';

/** One field-level validation failure (RFC 9457 `errors[]` extension member). */
export interface FieldError {
  field: string;
  message: string;
}

/** Human-readable title for each {@link ProblemType} (RFC 9457 `title`). */
const TITLES: Record<ProblemType, string> = {
  'bad-request': 'Bad Request',
  unauthenticated: 'Unauthenticated',
  'token-expired': 'Token Expired',
  forbidden: 'Forbidden',
  'not-found': 'Not Found',
  conflict: 'Conflict',
  'version-mismatch': 'Version Mismatch',
  'payload-too-large': 'Payload Too Large',
  'unsupported-media-type': 'Unsupported Media Type',
  'validation-failed': 'Validation Failed',
  'rate-limited': 'Too Many Requests',
  'internal-error': 'Internal Server Error',
  'service-unavailable': 'Service Unavailable',
  'invalid-token': 'Invalid Token',
  'account-locked': 'Account Locked',
  'email-not-verified': 'Email Not Verified',
  'account-disabled': 'Account Disabled',
  'mfa-invalid': 'Invalid Verification Code',
};

/** Looks up a title by `type`. `type` is always the closed `ProblemType` union, never client input. */
// eslint-disable-next-line security/detect-object-injection
const titleFor = (type: ProblemType): string => TITLES[type];

/**
 * Application error carrying everything `errorHandler` needs to render a Problem Details
 * response. Never put a stack trace, SQL text or other internal detail in `detail`.
 */
export class AppError extends Error {
  readonly status: number;
  readonly type: ProblemType;
  readonly title: string;
  readonly detail?: string;
  readonly errors?: FieldError[];
  /** Seconds the client should wait before retrying (rate-limited only). */
  readonly retryAfter?: number;

  constructor(
    status: number,
    type: ProblemType,
    options: { detail?: string; errors?: FieldError[]; retryAfter?: number } = {},
  ) {
    super(options.detail ?? titleFor(type));
    this.name = 'AppError';
    this.status = status;
    this.type = type;
    this.title = titleFor(type);
    this.detail = options.detail;
    this.errors = options.errors;
    this.retryAfter = options.retryAfter;
  }
}

/** 400 bad-request — malformed JSON or invalid parameters. */
export function badRequest(detail?: string): AppError {
  return new AppError(400, 'bad-request', { detail });
}

/** 401 unauthenticated / token-expired — missing, invalid or expired access token. */
export function unauthenticated(detail?: string, type: 'unauthenticated' | 'token-expired' = 'unauthenticated'): AppError {
  return new AppError(401, type, { detail });
}

/** 403 forbidden — authenticated but not allowed (wrong role). */
export function forbidden(detail?: string): AppError {
  return new AppError(403, 'forbidden', { detail });
}

/** 404 not-found — resource missing, or owned by another user (never reveal which). */
export function notFound(detail?: string): AppError {
  return new AppError(404, 'not-found', { detail });
}

/** 409 conflict — duplicate name, import already committed, etc. */
export function conflict(detail?: string): AppError {
  return new AppError(409, 'conflict', { detail });
}

/** 409 version-mismatch — optimistic-locking conflict on update. */
export function versionMismatch(detail?: string): AppError {
  return new AppError(409, 'version-mismatch', { detail });
}

/** 413 payload-too-large — request/file body exceeds the configured limit. */
export function payloadTooLarge(detail?: string): AppError {
  return new AppError(413, 'payload-too-large', { detail });
}

/** 415 unsupported-media-type — wrong Content-Type / file type. */
export function unsupportedMediaType(detail?: string): AppError {
  return new AppError(415, 'unsupported-media-type', { detail });
}

/** 422 validation-failed — business/schema validation failed; `errors[]` lists each field. */
export function validationFailed(errors: FieldError[], detail?: string): AppError {
  return new AppError(422, 'validation-failed', { detail: detail ?? 'One or more fields are invalid.', errors });
}

/** 429 rate-limited — too many requests; `retryAfterSeconds` becomes the `Retry-After` header. */
export function rateLimited(retryAfterSeconds: number, detail?: string): AppError {
  return new AppError(429, 'rate-limited', { detail, retryAfter: retryAfterSeconds });
}

/** 500 internal-error — unexpected failure; `detail` is never shown to the client. */
export function internal(detail?: string): AppError {
  return new AppError(500, 'internal-error', { detail });
}

/** 503 service-unavailable — a dependency (DB/Redis/AI) is down or the app is in maintenance. */
export function serviceUnavailable(detail?: string): AppError {
  return new AppError(503, 'service-unavailable', { detail });
}

/** 400 invalid-token — an email-verify/password-reset token is malformed, unknown, used or expired. */
export function invalidToken(detail?: string): AppError {
  return new AppError(400, 'invalid-token', { detail });
}

/** 429 account-locked — too many failed logins; `retryAfterSeconds` becomes `Retry-After` (BR-AU-04). */
export function accountLocked(retryAfterSeconds: number, detail?: string): AppError {
  return new AppError(429, 'account-locked', { detail, retryAfter: retryAfterSeconds });
}

/** 403 email-not-verified — credentials are correct but the account is still `pending`. */
export function emailNotVerified(detail?: string): AppError {
  return new AppError(403, 'email-not-verified', { detail });
}

/** 403 account-disabled — credentials are correct but an admin disabled the account. */
export function accountDisabled(detail?: string): AppError {
  return new AppError(403, 'account-disabled', { detail });
}

/** 401 mfa-invalid — wrong/expired/reused MFA challenge token, TOTP code or recovery code (TC-08). */
export function mfaInvalid(detail?: string): AppError {
  return new AppError(401, 'mfa-invalid', { detail: detail ?? 'Invalid verification code.' });
}
