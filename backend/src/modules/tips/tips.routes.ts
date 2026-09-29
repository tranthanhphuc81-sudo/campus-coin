/**
 * tips.routes.ts
 * Router for `/api/v1/tips`: requires an authenticated student behind the default authenticated
 * rate-limit preset (no dedicated tips preset exists in Table 46 — the default covers it).
 * Main exports: tipsRouter
 * Spec: docs/spec/05b §5.10 · docs/spec/07 §7.3.3 · Table 46 (rate limits)
 */
import { Router } from 'express';
import { Role } from '@campuscoin/shared';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { RATE_LIMIT_PRESETS } from '../../middlewares/rateLimit.js';
import { validate } from '../../middlewares/validate.js';
import { bigIntIdParamSchema } from './tips.schema.js';
import * as tipsController from './tips.controller.js';

/** Router mounted at `/api/v1/tips`. */
export const tipsRouter: Router = Router();

tipsRouter.use(authenticate, authorize(Role.STUDENT), ...RATE_LIMIT_PRESETS.authenticatedDefault);

tipsRouter.get('/', tipsController.listTips);
tipsRouter.post('/:id/pin', validate({ params: bigIntIdParamSchema }), tipsController.pinTip);
tipsRouter.post('/:id/unpin', validate({ params: bigIntIdParamSchema }), tipsController.unpinTip);
tipsRouter.post('/:id/dismiss', validate({ params: bigIntIdParamSchema }), tipsController.dismissTip);
