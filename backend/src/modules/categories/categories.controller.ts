/**
 * categories.controller.ts
 * HTTP <-> DTO glue for `/api/v1/categories`. Reads parsed input from `req.validated` and the
 * caller's identity from `req.auth`. All business logic lives in `categories.service.ts`.
 * Main exports: listCategories, createCategory, updateCategory, deleteCategory
 * Spec: docs/spec/07 §7.3.2 (categories)
 */
import type {
  CreateCategoryInput,
  DeleteCategoryQueryInput,
  IntIdParamInput,
  ListCategoriesQueryInput,
  UpdateCategoryInput,
} from '@campuscoin/shared';
import type { RequestHandler } from 'express';
import * as categoriesService from './categories.service.js';

/** `GET /categories` — system defaults + the caller's own categories (D1). */
export const listCategories: RequestHandler = async (req, res) => {
  const query = req.validated?.query as ListCategoriesQueryInput;
  const categories = await categoriesService.list(req.auth!.userId, query);
  res.status(200).json(categories);
};

/** `POST /categories` — creates a personal category. */
export const createCategory: RequestHandler = async (req, res) => {
  const body = req.validated?.body as CreateCategoryInput;
  const created = await categoriesService.create(req.auth!.userId, body);
  res.status(201).json(created);
};

/** `PATCH /categories/:id` — partial update of one of the caller's own categories. */
export const updateCategory: RequestHandler = async (req, res) => {
  const params = req.validated?.params as IntIdParamInput;
  const body = req.validated?.body as UpdateCategoryInput;
  const updated = await categoriesService.update(req.auth!.userId, params.id, body);
  res.status(200).json(updated);
};

/**
 * `DELETE /categories/:id` — deletes, archives (`?archive=true`) or reassigns-then-deletes
 * (`?reassignTo=<id>`) one of the caller's own categories. The service returns `undefined` when
 * the category was deleted (204) or the updated DTO when it was archived instead (200).
 */
export const deleteCategory: RequestHandler = async (req, res) => {
  const params = req.validated?.params as IntIdParamInput;
  const query = req.validated?.query as DeleteCategoryQueryInput;
  const result = await categoriesService.remove(req.auth!.userId, params.id, query);
  if (result) {
    res.status(200).json(result);
  } else {
    res.status(204).end();
  }
};
