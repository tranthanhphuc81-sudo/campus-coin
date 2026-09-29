/**
 * ai.routes.ts
 * Router for `/api/v1/ai`: every route requires an authenticated student. `/categorize/suggest` and
 * `/feedback` (L4 review fix) each additionally get their own tighter rate-limit preset (Table 46)
 * on top of the default one — the daily LLM-call quota itself is enforced inside
 * `ai.service.ts`/`ai.quota.ts`, not here.
 * Main exports: aiRouter
 * Spec: docs/spec/05b §5.6 (AI categorization) · Table 46 (rate limits)
 */
import { Router } from 'express';
import { Role, aiFeedbackSchema, categorizeSuggestSchema } from '@campuscoin/shared';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { RATE_LIMIT_PRESETS } from '../../middlewares/rateLimit.js';
import { validate } from '../../middlewares/validate.js';
import * as aiController from './ai.controller.js';

/** Router mounted at `/api/v1/ai`. */
export const aiRouter: Router = Router();

aiRouter.use(authenticate, authorize(Role.STUDENT), ...RATE_LIMIT_PRESETS.authenticatedDefault);

aiRouter.post(
  '/categorize/suggest',
  ...RATE_LIMIT_PRESETS.aiCategorizeSuggest,
  validate({ body: categorizeSuggestSchema }),
  aiController.suggestCategory,
);

aiRouter.post('/feedback', ...RATE_LIMIT_PRESETS.aiFeedback, validate({ body: aiFeedbackSchema }), aiController.submitFeedback);
