/**
 * activity.controller.ts
 * HTTP <-> DTO glue for `/api/v1/activity`. Reads parsed input from `req.validated` and the
 * caller's identity from `req.auth`. All business logic lives in `activity.service.ts`.
 * Main exports: listRecentActivity
 * Spec: docs/spec/05c §5.14
 */
import type { RequestHandler } from 'express';
import type { RecentActivityListResponse, RecentActivityQuery } from '@campuscoin/shared';
import * as activityService from './activity.service.js';

/** `GET /activity/recent?limit=` — the caller's most recently viewed/edited transactions. */
export const listRecentActivity: RequestHandler = async (req, res) => {
  const query = req.validated?.query as RecentActivityQuery;
  const data = await activityService.listRecent(req.auth!.userId, query.limit);
  const body: RecentActivityListResponse = { data };
  res.status(200).json(body);
};
