/**
 * admin-tip-templates.controller.ts
 * HTTP <-> DTO glue for `/api/v1/admin/tip-templates`. All business logic lives in
 * `admin-tip-templates.service.ts`; every write is audited here.
 * Main exports: listAdminTipTemplates, createAdminTipTemplate, updateAdminTipTemplate,
 *   deleteAdminTipTemplate, previewAdminTipTemplate
 * Spec: docs/spec/07 §7.3.4 (admin tip templates)
 */
import type {
  CreateTipTemplateInput,
  IntIdParamInput,
  PreviewTipTemplateInput,
  UpdateTipTemplateInput,
} from '@campuscoin/shared';
import type { RequestHandler } from 'express';
import { record } from '../audit/audit.service.js';
import * as adminTipTemplatesService from './admin-tip-templates.service.js';

/** `GET /admin/tip-templates` — every template. */
export const listAdminTipTemplates: RequestHandler = async (_req, res) => {
  const templates = await adminTipTemplatesService.list();
  res.status(200).json(templates);
};

/** `POST /admin/tip-templates` — creates a tip template. */
export const createAdminTipTemplate: RequestHandler = async (req, res) => {
  const body = req.validated?.body as CreateTipTemplateInput;
  const created = await adminTipTemplatesService.create(body, req.auth!.userId);
  await record({
    action: 'admin.template.create',
    actorId: req.auth!.userId,
    actorRole: req.auth!.role,
    entityType: 'tip_template',
    entityId: String(created.id),
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  res.status(201).json(created);
};

/** `PATCH /admin/tip-templates/:id` — partial update of a tip template. */
export const updateAdminTipTemplate: RequestHandler = async (req, res) => {
  const params = req.validated?.params as IntIdParamInput;
  const body = req.validated?.body as UpdateTipTemplateInput;
  const updated = await adminTipTemplatesService.update(params.id, body);
  await record({
    action: 'admin.template.update',
    actorId: req.auth!.userId,
    actorRole: req.auth!.role,
    entityType: 'tip_template',
    entityId: String(params.id),
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  res.status(200).json(updated);
};

/** `DELETE /admin/tip-templates/:id` — hard-deletes an unused tip template (409 when in use). */
export const deleteAdminTipTemplate: RequestHandler = async (req, res) => {
  const params = req.validated?.params as IntIdParamInput;
  await adminTipTemplatesService.remove(params.id);
  await record({
    action: 'admin.template.delete',
    actorId: req.auth!.userId,
    actorRole: req.auth!.role,
    entityType: 'tip_template',
    entityId: String(params.id),
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  res.status(204).end();
};

/** `POST /admin/tip-templates/preview` — read-only render of an in-progress edit; never audited. */
export const previewAdminTipTemplate: RequestHandler = async (req, res) => {
  const body = req.validated?.body as PreviewTipTemplateInput;
  const rendered = adminTipTemplatesService.preview(body);
  res.status(200).json(rendered);
};
