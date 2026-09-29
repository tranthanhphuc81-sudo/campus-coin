/**
 * announcements.controller.ts
 * HTTP <-> DTO glue for `/api/v1/announcements`. Public/student read-only in P09 — no `req.auth`
 * is read here (the route is deliberately not behind `authenticate`, see `announcements.routes.ts`).
 * Main exports: listActiveAnnouncements
 * Spec: docs/spec/05c §5.13 (announcements) · docs/spec/07 §7.3.3
 */
import type { RequestHandler } from 'express';
import * as announcementsService from './announcements.service.js';

/** `GET /announcements/active` — every currently-active announcement. Public: works logged out. */
export const listActiveAnnouncements: RequestHandler = async (_req, res) => {
  const announcements = await announcementsService.listActive();
  res.status(200).json(announcements);
};
