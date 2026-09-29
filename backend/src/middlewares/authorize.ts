/**
 * authorize.ts
 * Role-based access control: `authorize(...roles)` allows the request only if `req.auth.role`
 * (set by `authenticate`, which must run first) is one of `roles`. Ownership checks (a student
 * can only ever see their own data) are a separate, repository-layer rule — never enforced here.
 * Main exports: authorize
 * Spec: docs/spec/09 §9.6 (Table 54 – authorization matrix)
 */
import type { Role } from '@campuscoin/shared';
import type { RequestHandler } from 'express';
import { forbidden, unauthenticated } from '../lib/problem.js';

/**
 * Builds a middleware that requires the caller's role to be one of `roles`.
 * @param roles - Allowed roles (e.g. `authorize(Role.ADMIN)`).
 */
export function authorize(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) {
      next(unauthenticated('Authentication is required'));
      return;
    }
    if (!roles.includes(req.auth.role)) {
      next(forbidden('You do not have permission to perform this action'));
      return;
    }
    next();
  };
}
