/**
 * admin-stats.controller.ts
 * HTTP <-> DTO glue for `/api/v1/admin/stats` (read-only, no body/query). All logic lives in
 * `admin-stats.service.ts`.
 * Main exports: getAdminStatsOverview, getAdminCategoriesUsage
 * Spec: docs/spec/07 §7.3.4 (admin stats)
 */
import type { RequestHandler } from 'express';
import * as adminStatsService from './admin-stats.service.js';

/** `GET /admin/stats/overview`. */
export const getAdminStatsOverview: RequestHandler = async (_req, res) => {
  const data = await adminStatsService.overview();
  res.status(200).json(data);
};

/** `GET /admin/stats/categories-usage`. */
export const getAdminCategoriesUsage: RequestHandler = async (_req, res) => {
  const data = await adminStatsService.categoriesUsage();
  res.status(200).json(data);
};
