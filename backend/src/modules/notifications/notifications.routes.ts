/**
 * notifications.routes.ts
 * Router for `/api/v1/notifications`. Every route except `GET /stream` requires an authenticated
 * student behind the default rate-limit preset. `GET /stream` cannot use the normal Bearer
 * `authenticate` middleware (EventSource cannot set an Authorization header) — it validates its
 * own one-time `?ticket=` instead (obtained from `POST /stream-ticket`, which IS Bearer-protected).
 * Main exports: notificationsRouter
 * Spec: docs/spec/05c §5.11 (notifications) · docs/spec/07 §7.3.3 · Table 46 (rate limits)
 */
import { Router } from 'express';
import { Role, listNotificationsQuerySchema } from '@campuscoin/shared';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { RATE_LIMIT_PRESETS } from '../../middlewares/rateLimit.js';
import { validate } from '../../middlewares/validate.js';
import { bigIntIdParamSchema } from './notifications.schema.js';
import * as notificationsController from './notifications.controller.js';

/** Router mounted at `/api/v1/notifications`. */
export const notificationsRouter: Router = Router();

/** Applied to every route except `GET /stream` (see file header). */
const requireStudent = [authenticate, authorize(Role.STUDENT), ...RATE_LIMIT_PRESETS.authenticatedDefault];

notificationsRouter.get(
  '/',
  ...requireStudent,
  validate({ query: listNotificationsQuerySchema }),
  notificationsController.listNotifications,
);

notificationsRouter.post('/read-all', ...requireStudent, notificationsController.markAllRead);

notificationsRouter.post('/stream-ticket', ...requireStudent, notificationsController.createStreamTicket);

notificationsRouter.post(
  '/:id/read',
  ...requireStudent,
  validate({ params: bigIntIdParamSchema }),
  notificationsController.markRead,
);

// Deliberately no `authenticate`/rate-limit here — see file header.
notificationsRouter.get('/stream', notificationsController.streamNotifications);
