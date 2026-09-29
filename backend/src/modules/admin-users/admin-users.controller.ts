/**
 * admin-users.controller.ts
 * HTTP <-> DTO glue for `/api/v1/admin/users`. All business logic (incl. audit writes) lives in
 * `admin-users.service.ts`.
 * Main exports: listAdminUsers, getAdminUser, disableAdminUser, enableAdminUser,
 *   sendResetLinkAdminUser
 * Spec: docs/spec/07 §7.3.4 (admin users)
 */
import type { ListAdminUsersQueryInput, UuidParamInput } from '@campuscoin/shared';
import type { Request, RequestHandler } from 'express';
import type { AdminActionContext } from './admin-users.service.js';
import * as adminUsersService from './admin-users.service.js';

/** Builds the acting-admin context every write action audits itself under. */
function actorFrom(req: Request): AdminActionContext {
  return { userId: req.auth!.userId, role: req.auth!.role, ip: req.ip, userAgent: req.get('user-agent') };
}

/** `GET /admin/users` — searchable, filterable, paginated user list. */
export const listAdminUsers: RequestHandler = async (req, res) => {
  const query = req.validated?.query as ListAdminUsersQueryInput;
  const result = await adminUsersService.list(query);
  res.status(200).json(result);
};

/** `GET /admin/users/:id` — full email + transaction count only (never transaction content). */
export const getAdminUser: RequestHandler = async (req, res) => {
  const params = req.validated?.params as UuidParamInput;
  const user = await adminUsersService.detail(params.id);
  res.status(200).json(user);
};

/** `POST /admin/users/:id/disable` — BR-AU-08: also kills sessions + outstanding tokens. */
export const disableAdminUser: RequestHandler = async (req, res) => {
  const params = req.validated?.params as UuidParamInput;
  await adminUsersService.disable(params.id, actorFrom(req));
  res.status(204).end();
};

/** `POST /admin/users/:id/enable`. */
export const enableAdminUser: RequestHandler = async (req, res) => {
  const params = req.validated?.params as UuidParamInput;
  await adminUsersService.enable(params.id, actorFrom(req));
  res.status(204).end();
};

/** `POST /admin/users/:id/send-reset` — always 202, regardless of the target account's status. */
export const sendResetLinkAdminUser: RequestHandler = async (req, res) => {
  const params = req.validated?.params as UuidParamInput;
  await adminUsersService.sendResetLink(params.id, actorFrom(req));
  res.status(202).end();
};
