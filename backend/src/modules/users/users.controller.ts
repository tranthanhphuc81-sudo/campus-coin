/**
 * users.controller.ts
 * HTTP <-> DTO glue for `/api/v1/me/*`. Reads parsed input from `req.validated` and the caller's
 * identity from `req.auth` (set by `authenticate`, mounted ahead of every route here). All
 * business logic lives in `users.service.ts`.
 * Main exports: getMe, updateMe, changePassword, listSessions, revokeSession
 * Spec: docs/spec/07 §7.3.1 (users/me)
 */
import type { ChangePasswordInput, UpdateProfileInput } from '@campuscoin/shared';
import type { Request, RequestHandler } from 'express';
import { notFound } from '../../lib/problem.js';
import { toUserDto } from './users.mapper.js';
import type { SessionIdParamInput } from './users.schema.js';
import * as usersService from './users.service.js';

/** Builds the `SessionContext` (IP/User-Agent) shared by the service calls below. */
function contextFrom(req: Request): { ip?: string; userAgent?: string } {
  return { ip: req.ip, userAgent: req.header('user-agent') };
}

/** `GET /me` — the caller's own profile. */
export const getMe: RequestHandler = async (req, res) => {
  const user = await usersService.getProfile(req.auth!.userId);
  res.status(200).json(toUserDto(user));
};

/** `PATCH /me` — partial profile update (whitelisted by `updateProfileSchema`, BR-AU-01). */
export const updateMe: RequestHandler = async (req, res) => {
  const body = req.validated?.body as UpdateProfileInput;
  const updated = await usersService.updateProfile(req.auth!.userId, body, contextFrom(req));
  res.status(200).json(toUserDto(updated));
};

/** `PATCH /me/password` — change password; keeps the current session, signs out every other one. */
export const changePassword: RequestHandler = async (req, res) => {
  const body = req.validated?.body as ChangePasswordInput;
  await usersService.changePassword(
    req.auth!.userId,
    req.auth!.sessionId,
    body.currentPassword,
    body.newPassword,
    contextFrom(req),
  );
  res.status(204).end();
};

/** `GET /me/sessions` — one entry per active device/session, flagging the caller's current one. */
export const listSessions: RequestHandler = async (req, res) => {
  const sessions = await usersService.listSessions(req.auth!.userId);
  res.status(200).json(
    sessions.map((s) => ({
      id: s.familyId,
      userAgent: s.userAgent,
      createdAt: s.createdAt.toISOString(),
      lastUsedAt: s.lastUsedAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      current: s.familyId === req.auth!.sessionId,
    })),
  );
};

/**
 * `DELETE /me/sessions/:id` — revokes one of the caller's own sessions. A `false` result (not
 * owned by this user, or unknown) is reported as 404, matching the "cross-tenant 404" invariant.
 */
export const revokeSession: RequestHandler = async (req, res) => {
  const params = req.validated?.params as SessionIdParamInput;
  const revoked = await usersService.revokeSession(req.auth!.userId, params.id, contextFrom(req));
  if (!revoked) throw notFound('Session not found.');
  res.status(204).end();
};
