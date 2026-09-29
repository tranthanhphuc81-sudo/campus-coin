/**
 * announcements.routes.ts
 * Router for `/api/v1/announcements`. `GET /active` is public (`P/S` in the API table) — it must
 * work for a logged-out visitor on the public site too, so this router deliberately does NOT use
 * `authenticate`/`authorize`, unlike every other P09 module router. Still rate-limited by IP
 * (`authenticatedDefault` falls back to the caller's IP when there is no `req.auth`).
 * Main exports: announcementsRouter
 * Spec: docs/spec/05c §5.13 (announcements) · docs/spec/07 §7.3.3 · Table 46 (rate limits)
 */
import { Router } from 'express';
import { RATE_LIMIT_PRESETS } from '../../middlewares/rateLimit.js';
import * as announcementsController from './announcements.controller.js';

/** Router mounted at `/api/v1/announcements`. */
export const announcementsRouter: Router = Router();

announcementsRouter.use(...RATE_LIMIT_PRESETS.authenticatedDefault);

announcementsRouter.get('/active', announcementsController.listActiveAnnouncements);
