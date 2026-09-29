/**
 * express.d.ts
 * Augments Express's `Request` with fields set by our own middlewares, so controllers/services
 * get them fully typed instead of casting.
 * - `id`: set by middlewares/requestId.ts (also read by pino-http as the log correlation id).
 * - `auth`: set by middlewares/authenticate.ts from the verified access token.
 * - `validated`: set by middlewares/validate.ts; controllers read parsed input from here instead
 *   of mutating `req.body/query/params` (Express 5 treats `req.query` as read-only).
 * Spec: docs/spec/04 §4.2 (middleware chain) · docs/spec/09 §9.5–9.6 (auth & RBAC)
 */
import type { Role } from '@campuscoin/shared';

declare global {
  namespace Express {
    interface Request {
      /** Correlation id for this request; always set once requestId middleware has run. */
      id: string;
      /** Verified access-token claims; set once `authenticate` has run. */
      auth?: {
        userId: string;
        role: Role;
        sessionId: string;
      };
      /** Zod-parsed body/query/params; set once `validate(...)` has run. */
      validated?: {
        body?: unknown;
        query?: unknown;
        params?: unknown;
      };
    }
  }
}

export {};
