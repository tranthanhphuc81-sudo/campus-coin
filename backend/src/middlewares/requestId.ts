/**
 * requestId.ts
 * First middleware in the chain (see app.ts). Reads an inbound `X-Request-Id` (useful when a
 * reverse proxy already assigns one) or generates a UUID, stores it on `req.id` for the logger
 * and error handler to pick up, and echoes it back so every response can be traced to its logs.
 * Main exports: requestId
 * Spec: docs/spec/07 §7.1 (Table 40 – every response carries X-Request-Id)
 */
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

const HEADER = 'X-Request-Id';

/**
 * A-L2: only accept a client-supplied id shaped like the ones this app/its proxies actually
 * generate (a UUID is 36 chars, but allow a little slack for other reasonable correlation-id
 * schemes) — anything else (wrong length, unexpected characters) could otherwise be echoed
 * unvalidated into logs/responses/problem bodies.
 */
const VALID_REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;

/** Express middleware: assigns/propagates the request id. Must run before the logger. */
export const requestId: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const incoming = req.header(HEADER);
  req.id = incoming && VALID_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader(HEADER, req.id);
  next();
};
