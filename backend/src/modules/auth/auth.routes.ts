/**
 * auth.routes.ts
 * Router for `/api/v1/auth/*`: wires Zod validation, rate-limit presets (docs/spec/07 Table 46)
 * and the CSRF guard onto the auth.controller handlers. Mounted in app.ts behind
 * `corsWithCredentials` (this prefix is the only one that ever needs cookies).
 * Main exports: authRouter
 * Spec: docs/spec/07 §7.3.1 (Table 46 rate limits) · docs/spec/09 §9.11 (CSRF)
 */
import { Router } from 'express';
import {
  emailOnlySchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '@campuscoin/shared';
import { authenticate } from '../../middlewares/authenticate.js';
import { RATE_LIMIT_PRESETS } from '../../middlewares/rateLimit.js';
import { requireCsrfHeaders } from '../../middlewares/requireCsrfHeaders.js';
import { validate } from '../../middlewares/validate.js';
import * as authController from './auth.controller.js';

/** Router mounted at `/api/v1/auth`. */
export const authRouter: Router = Router();

authRouter.post(
  '/register',
  ...RATE_LIMIT_PRESETS.authRegister,
  validate({ body: registerSchema }),
  authController.register,
);

authRouter.post(
  '/verify-email',
  ...RATE_LIMIT_PRESETS.authTokenAction,
  validate({ body: verifyEmailSchema }),
  authController.verifyEmail,
);

authRouter.post(
  '/resend-verification',
  ...RATE_LIMIT_PRESETS.authForgotPassword,
  validate({ body: emailOnlySchema }),
  authController.resendVerification,
);

authRouter.post(
  '/forgot-password',
  ...RATE_LIMIT_PRESETS.authForgotPassword,
  validate({ body: emailOnlySchema }),
  authController.forgotPassword,
);

authRouter.post(
  '/reset-password',
  ...RATE_LIMIT_PRESETS.authTokenAction,
  validate({ body: resetPasswordSchema }),
  authController.resetPassword,
);

authRouter.post('/login', ...RATE_LIMIT_PRESETS.authLogin, validate({ body: loginSchema }), authController.login);

authRouter.post('/refresh', ...RATE_LIMIT_PRESETS.authRefreshLogout, requireCsrfHeaders, authController.refresh);

authRouter.post('/logout', ...RATE_LIMIT_PRESETS.authRefreshLogout, requireCsrfHeaders, authController.logout);

authRouter.post('/logout-all', authenticate, requireCsrfHeaders, authController.logoutAll);
