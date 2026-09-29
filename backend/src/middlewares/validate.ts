/**
 * validate.ts
 * Zod request validation. On success, parsed (and defaulted/coerced) data is attached to
 * `req.validated.{body,query,params}` — controllers read from there, never from the raw
 * `req.body/query/params`, so a schema can never be bypassed and Express 5's read-only
 * `req.query` getter is never fought. On failure, responds 422 `validation-failed` with one
 * `{field, message}` entry per Zod issue.
 * Main exports: validate
 * Spec: docs/spec/07 §7.2 (Table 41 – 422 validation-failed) · docs/spec/09 §9.4 (A03 Injection – Zod whitelist)
 */
import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { validationFailed, type FieldError } from '../lib/problem.js';

export interface ValidateSchemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

function toFieldErrors(issues: { path: PropertyKey[]; message: string }[]): FieldError[] {
  return issues.map((issue) => ({ field: issue.path.map(String).join('.') || '(root)', message: issue.message }));
}

/**
 * Builds a middleware that parses `req.body`/`req.query`/`req.params` against the given Zod
 * schemas (only the keys provided are validated) and stores the result on `req.validated`.
 */
export function validate(schemas: ValidateSchemas): RequestHandler {
  return (req, _res, next) => {
    const errors: FieldError[] = [];
    const validated: { body?: unknown; query?: unknown; params?: unknown } = {};

    // `part` only ever iterates the fixed tuple below, never client input.
    /* eslint-disable security/detect-object-injection */
    for (const part of ['body', 'query', 'params'] as const) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part]);
      if (result.success) {
        validated[part] = result.data;
      } else {
        errors.push(...toFieldErrors(result.error.issues));
      }
    }
    /* eslint-enable security/detect-object-injection */

    if (errors.length > 0) {
      next(validationFailed(errors));
      return;
    }
    req.validated = validated;
    next();
  };
}
