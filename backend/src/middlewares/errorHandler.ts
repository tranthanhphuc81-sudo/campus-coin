/**
 * errorHandler.ts
 * Last middleware in the chain (see app.ts). Turns any error into an RFC 9457
 * `application/problem+json` response: `{type, title, status, detail, instance, requestId,
 * errors?}`. Never leaks a stack trace or SQL text — unexpected errors are logged with full
 * detail server-side (and reported to Sentry, P20, if configured) and rendered to the client as
 * a generic `internal-error`.
 * Main exports: errorHandler
 * Spec: docs/spec/07 §7.2 (Table 41) · docs/spec/09 §9.4 (Information disclosure)
 */
import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '../generated/prisma/client.js';
import { logger } from '../lib/logger.js';
import { AppError, badRequest, conflict, internal, notFound, payloadTooLarge, validationFailed } from '../lib/problem.js';
import { captureError } from '../lib/sentry.js';

/** A body-parser (express.json) error: has `status`/`statusCode` and a `type` discriminator. */
interface BodyParserError extends Error {
  status?: number;
  statusCode?: number;
  type?: string;
}

function isBodyParserError(err: unknown): err is BodyParserError {
  return err instanceof Error && 'type' in err && typeof (err as BodyParserError).type === 'string';
}

/**
 * Maps a Prisma "known request error" to the matching {@link AppError} (docs/spec/07 Table 41).
 * A-L1/B-L2/C-L2: the fallback 500 never puts the Prisma error code in `detail` — `problem.ts`
 * already documents that `internal()`'s `detail` is never shown to the client, but this used to
 * violate that by embedding `err.code` in the string. The real code is logged server-side only,
 * by the caller ({@link errorHandler}), which still has the original `err` object.
 */
function fromPrismaError(err: Prisma.PrismaClientKnownRequestError): AppError {
  switch (err.code) {
    case 'P2002':
      return conflict('A record with the same unique value already exists.');
    case 'P2025':
      return notFound('The requested resource does not exist.');
    default:
      return internal();
  }
}

/** Converts any thrown/rejected error into the {@link AppError} that describes its response. */
function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof Prisma.PrismaClientKnownRequestError) return fromPrismaError(err);
  if (err instanceof ZodError) {
    return validationFailed(err.issues.map((issue) => ({ field: issue.path.map(String).join('.') || '(root)', message: issue.message })));
  }
  if (isBodyParserError(err)) {
    if (err.type === 'entity.too.large') return payloadTooLarge('Request body exceeds the size limit.');
    if (err.type === 'entity.parse.failed' || err instanceof SyntaxError) return badRequest('Malformed JSON body.');
  }
  return internal();
}

/**
 * Express error-handling middleware (4 args = error handler by Express convention). Always the
 * last `app.use(...)` call.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const appError = toAppError(err);

  if (appError.status >= 500) {
    // Full detail server-side only; the client never sees this (A-L1/B-L2/C-L2). The Prisma error
    // code is logged under its own `prismaErrorCode` field, not nested under `err.code` — even
    // though pino's redact list (lib/logger.ts, C-L1) no longer blanket-redacts every `*.code`
    // path, a real Prisma error is logged alongside the raw `err` object here, and staying off
    // `err.code` avoids any future redact-path change on `err.*` silently hiding this diagnostic.
    const prismaErrorCode = err instanceof Prisma.PrismaClientKnownRequestError ? err.code : undefined;
    logger.error(
      { err, requestId: req.id, ...(prismaErrorCode ? { prismaErrorCode } : {}) },
      `[errorHandler] ${req.method} ${req.originalUrl}`,
    );
    // P20: surface unexpected (5xx) failures to Sentry too, if configured — never the 4xx cases
    // handled in the branch below, which are expected client errors, not incidents.
    // req.path (not req.originalUrl/req.url): a query string can carry a live secret (e.g.
    // `?ticket=`, `?token=`) that must never reach a third party (security review, P20).
    captureError(err, { requestId: String(req.id), route: req.path });
  } else {
    logger.warn({ requestId: req.id, type: appError.type }, `[errorHandler] ${req.method} ${req.originalUrl}`);
  }

  if (appError.retryAfter !== undefined) {
    res.setHeader('Retry-After', String(appError.retryAfter));
  }

  res.status(appError.status).contentType('application/problem+json').json({
    type: appError.type,
    title: appError.title,
    status: appError.status,
    // Defense in depth (P19 confirmation-review fix): every 5xx AppError today is already built
    // with no `detail`, but this strips it unconditionally rather than trusting every future
    // call site to keep it that way — a 500+ response must never describe the internal failure.
    detail: appError.status >= 500 ? undefined : appError.detail,
    instance: req.originalUrl,
    requestId: req.id,
    ...(appError.errors ? { errors: appError.errors } : {}),
  });
};
