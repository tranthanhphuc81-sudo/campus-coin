/**
 * bookmarks.routes.ts
 * Router for `/api/v1/bookmarks`: every route requires an authenticated student, the default
 * authenticated rate-limit preset (Table 46), then Zod validation. `POST /bookmarks` also gets the
 * idempotency middleware (mirrors `budgets.routes.ts`'s `PUT /budgets`).
 * Main exports: bookmarksRouter
 * Spec: docs/spec/05c §5.12 · docs/spec/07 §7.3.3 · Table 46 (rate limits)
 */
import { Router } from 'express';
import { Role, bookmarkIdParamSchema, createBookmarkSchema, listBookmarksQuerySchema, updateBookmarkSchema } from '@campuscoin/shared';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { idempotency } from '../../lib/idempotency.js';
import { RATE_LIMIT_PRESETS } from '../../middlewares/rateLimit.js';
import { validate } from '../../middlewares/validate.js';
import * as bookmarksController from './bookmarks.controller.js';

/** Router mounted at `/api/v1/bookmarks`. */
export const bookmarksRouter: Router = Router();

bookmarksRouter.use(authenticate, authorize(Role.STUDENT), ...RATE_LIMIT_PRESETS.authenticatedDefault);

bookmarksRouter.get('/', validate({ query: listBookmarksQuerySchema }), bookmarksController.listBookmarks);

bookmarksRouter.post('/', idempotency, validate({ body: createBookmarkSchema }), bookmarksController.createBookmark);

bookmarksRouter.patch('/:id', validate({ params: bookmarkIdParamSchema, body: updateBookmarkSchema }), bookmarksController.updateBookmark);

bookmarksRouter.delete('/:id', validate({ params: bookmarkIdParamSchema }), bookmarksController.deleteBookmark);
