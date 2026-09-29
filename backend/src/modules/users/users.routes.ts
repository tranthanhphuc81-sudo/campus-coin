/**
 * users.routes.ts
 * Router for `/api/v1/me/*`: every route requires `authenticate` first, then the default
 * authenticated rate-limit preset (Table 46), then Zod validation. `GET /me/export` and
 * `DELETE /me` (P16, docs/spec/09 §9.14) additionally require `authorize(Role.STUDENT)` — their
 * controller logic lives in `modules/privacy/`, mounted here since both paths are under `/me`.
 * Main exports: usersRouter
 * Spec: docs/spec/07 §7.3.1 (users/me) · docs/spec/09 §9.14 (privacy) · Table 46 (rate limits)
 */
import { Router } from 'express';
import { changePasswordSchema, deleteAccountSchema, exportQuerySchema, Role, updateProfileSchema } from '@campuscoin/shared';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { RATE_LIMIT_PRESETS } from '../../middlewares/rateLimit.js';
import { validate } from '../../middlewares/validate.js';
import * as privacyController from '../privacy/privacy.controller.js';
import * as usersController from './users.controller.js';
import { sessionIdParamSchema } from './users.schema.js';

/** Router mounted at `/api/v1/me`. */
export const usersRouter: Router = Router();

usersRouter.use(authenticate, ...RATE_LIMIT_PRESETS.authenticatedDefault);

usersRouter.get('/', usersController.getMe);

usersRouter.patch('/', validate({ body: updateProfileSchema }), usersController.updateMe);

usersRouter.patch(
  '/password',
  ...RATE_LIMIT_PRESETS.changePassword,
  validate({ body: changePasswordSchema }),
  usersController.changePassword,
);

usersRouter.get('/sessions', usersController.listSessions);

usersRouter.delete('/sessions/:id', validate({ params: sessionIdParamSchema }), usersController.revokeSession);

/** `GET /me/export?format=json|csv` — docs/spec/09 §9.14 (data portability), student-only, 3/day. */
usersRouter.get(
  '/export',
  authorize(Role.STUDENT),
  ...RATE_LIMIT_PRESETS.meExport,
  validate({ query: exportQuerySchema }),
  privacyController.getExport,
);

/** `DELETE /me` — docs/spec/09 §9.14 (right to erasure), student-only, same limiter as `PATCH /me/password`. */
usersRouter.delete(
  '/',
  authorize(Role.STUDENT),
  ...RATE_LIMIT_PRESETS.changePassword,
  validate({ body: deleteAccountSchema }),
  privacyController.deleteMe,
);
