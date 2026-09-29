/**
 * admin-announcements.controller.ts
 * HTTP <-> DTO glue for `/api/v1/admin/announcements`. All business logic lives in
 * `admin-announcements.service.ts`; every write is audited here.
 * Main exports: listAdminAnnouncements, createAdminAnnouncement, updateAdminAnnouncement,
 *   deleteAdminAnnouncement
 * Spec: docs/spec/07 §7.3.4 (admin announcements)
 */
import type { CreateAnnouncementInput, IntIdParamInput, UpdateAnnouncementInput } from '@campuscoin/shared';
import type { RequestHandler } from 'express';
import { record } from '../audit/audit.service.js';
import * as adminAnnouncementsService from './admin-announcements.service.js';

/** `GET /admin/announcements` — every announcement. */
export const listAdminAnnouncements: RequestHandler = async (_req, res) => {
  const announcements = await adminAnnouncementsService.list();
  res.status(200).json(announcements);
};

/** `POST /admin/announcements` — creates an announcement. */
export const createAdminAnnouncement: RequestHandler = async (req, res) => {
  const body = req.validated?.body as CreateAnnouncementInput;
  const created = await adminAnnouncementsService.create(body, req.auth!.userId);
  await record({
    action: 'admin.announcement.create',
    actorId: req.auth!.userId,
    actorRole: req.auth!.role,
    entityType: 'announcement',
    entityId: String(created.id),
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  res.status(201).json(created);
};

/** `PATCH /admin/announcements/:id` — partial update of an announcement. */
export const updateAdminAnnouncement: RequestHandler = async (req, res) => {
  const params = req.validated?.params as IntIdParamInput;
  const body = req.validated?.body as UpdateAnnouncementInput;
  const updated = await adminAnnouncementsService.update(params.id, body);
  await record({
    action: 'admin.announcement.update',
    actorId: req.auth!.userId,
    actorRole: req.auth!.role,
    entityType: 'announcement',
    entityId: String(params.id),
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  res.status(200).json(updated);
};

/** `DELETE /admin/announcements/:id` — hard-deletes an announcement. */
export const deleteAdminAnnouncement: RequestHandler = async (req, res) => {
  const params = req.validated?.params as IntIdParamInput;
  await adminAnnouncementsService.remove(params.id);
  await record({
    action: 'admin.announcement.delete',
    actorId: req.auth!.userId,
    actorRole: req.auth!.role,
    entityType: 'announcement',
    entityId: String(params.id),
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  res.status(204).end();
};
