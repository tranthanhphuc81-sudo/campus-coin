/**
 * notFound.ts
 * Catch-all for requests that matched no route. Mounted right before `errorHandler` (see app.ts)
 * so an unknown path still gets a proper RFC 9457 `not-found` response instead of Express's
 * default HTML 404 page.
 * Main exports: notFound
 * Spec: docs/spec/07 §7.2 (Table 41)
 */
import type { RequestHandler } from 'express';
import { notFound as notFoundError } from '../lib/problem.js';

/** Express middleware: turns any unmatched route into a `not-found` AppError. */
export const notFound: RequestHandler = (req, _res, next) => {
  next(notFoundError(`Route ${req.method} ${req.originalUrl} does not exist`));
};
