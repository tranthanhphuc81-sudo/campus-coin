export type ProblemFieldError = {
  field: string;
  message: string;
};

export class AppError extends Error {
  readonly status: number;
  readonly type: string;
  readonly title: string;
  readonly detail?: string;
  readonly errors?: ProblemFieldError[];

  constructor(
    status: number,
    type: string,
    title: string,
    detail?: string,
    errors?: ProblemFieldError[],
  ) {
    super(detail ?? title);
    this.status = status;
    this.type = type;
    this.title = title;
    this.detail = detail;
    this.errors = errors;
  }
}

export function badRequest(detail: string, errors?: ProblemFieldError[]): AppError {
  return new AppError(
    400,
    "https://campus-coin.dev/problems/bad-request",
    "Bad Request",
    detail,
    errors,
  );
}

export function unauthenticated(detail = "Authentication is required."): AppError {
  return new AppError(
    401,
    "https://campus-coin.dev/problems/unauthenticated",
    "Unauthenticated",
    detail,
  );
}

export function forbidden(detail = "You are not allowed to access this resource."): AppError {
  return new AppError(403, "https://campus-coin.dev/problems/forbidden", "Forbidden", detail);
}

export function notFound(detail = "Resource not found."): AppError {
  return new AppError(404, "https://campus-coin.dev/problems/not-found", "Not Found", detail);
}

export function conflict(detail: string, errors?: ProblemFieldError[]): AppError {
  return new AppError(409, "https://campus-coin.dev/problems/conflict", "Conflict", detail, errors);
}

export function payloadTooLarge(detail: string): AppError {
  return new AppError(
    413,
    "https://campus-coin.dev/problems/payload-too-large",
    "Payload Too Large",
    detail,
  );
}

export function unsupportedMediaType(detail: string): AppError {
  return new AppError(
    415,
    "https://campus-coin.dev/problems/unsupported-media-type",
    "Unsupported Media Type",
    detail,
  );
}

export function validationFailed(errors: ProblemFieldError[]): AppError {
  return new AppError(
    422,
    "https://campus-coin.dev/problems/validation-failed",
    "Validation Failed",
    "One or more fields are invalid.",
    errors,
  );
}

export function rateLimited(detail = "Too many requests."): AppError {
  return new AppError(
    429,
    "https://campus-coin.dev/problems/rate-limited",
    "Too Many Requests",
    detail,
  );
}

export function tokenExpired(detail = "Your session has expired. Please sign in again."): AppError {
  return new AppError(
    401,
    "https://campus-coin.dev/problems/token-expired",
    "Session Expired",
    detail,
  );
}
