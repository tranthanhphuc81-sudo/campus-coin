/**
 * admin-categories.controller.ts
 * HTTP <-> DTO glue for `/api/v1/admin/categories`. All business logic lives in
 * `admin-categories.service.ts`; every write is audited here (dotted action codes, docs/spec/09
 * Table 58).
 * Main exports: listAdminCategories, createAdminCategory, updateAdminCategory, deleteAdminCategory
 * Spec: docs/spec/07 §7.3.4 (admin categories)
 */
import type { CreateCategoryInput, IntIdParamInput, TransactionType, UpdateCategoryInput } from '@campuscoin/shared';
import type { RequestHandler } from 'express';
import { record } from '../audit/audit.service.js';
import * as adminCategoriesService from './admin-categories.service.js';

/** `GET /admin/categories` — every default category (active and archived). */
export const listAdminCategories: RequestHandler = async (req, res) => {
  const query = req.validated?.query as { type?: TransactionType };
  const categories = await adminCategoriesService.list(query.type);
  res.status(200).json(categories);
};

/** `POST /admin/categories` — creates a system-default category. */
export const createAdminCategory: RequestHandler = async (req, res) => {
  const body = req.validated?.body as CreateCategoryInput;
  const created = await adminCategoriesService.create(body);
  await record({
    action: 'admin.category.create',
    actorId: req.auth!.userId,
    actorRole: req.auth!.role,
    entityType: 'category',
    entityId: String(created.id),
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  res.status(201).json(created);
};

/** `PATCH /admin/categories/:id` — partial update of a system-default category. */
export const updateAdminCategory: RequestHandler = async (req, res) => {
  const params = req.validated?.params as IntIdParamInput;
  const body = req.validated?.body as UpdateCategoryInput;
  const updated = await adminCategoriesService.update(params.id, body);
  await record({
    action: 'admin.category.update',
    actorId: req.auth!.userId,
    actorRole: req.auth!.role,
    entityType: 'category',
    entityId: String(params.id),
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  res.status(200).json(updated);
};

/**
 * `DELETE /admin/categories/:id?archive=true` — archives or hard-deletes a system-default
 * category (BR-CA-05). The service returns `undefined` when hard-deleted (204) or the updated DTO
 * when archived instead (200).
 */
export const deleteAdminCategory: RequestHandler = async (req, res) => {
  const params = req.validated?.params as IntIdParamInput;
  const query = req.validated?.query as { archive?: boolean };
  const result = await adminCategoriesService.remove(params.id, query.archive ?? false);
  await record({
    action: result ? 'admin.category.archive' : 'admin.category.delete',
    actorId: req.auth!.userId,
    actorRole: req.auth!.role,
    entityType: 'category',
    entityId: String(params.id),
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  if (result) {
    res.status(200).json(result);
  } else {
    res.status(204).end();
  }
};
