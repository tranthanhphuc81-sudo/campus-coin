import { Router } from "express";

import { validate } from "../../middlewares/validate.js";
import {
  adminLoginHandler,
  forgotPasswordHandler,
  loginHandler,
  logoutHandler,
  refreshHandler,
  registerHandler,
  resetPasswordHandler,
  verifyEmailHandler,
} from "./controller.js";
import {
  adminLoginSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from "./schema.js";

export const authRouter = Router();
export const adminAuthRouter = Router();

authRouter.post("/register", validate({ body: registerSchema }), registerHandler);
authRouter.post("/login", validate({ body: loginSchema }), loginHandler);
authRouter.post("/refresh", refreshHandler);
authRouter.post("/logout", logoutHandler);
authRouter.post("/verify-email", validate({ body: verifyEmailSchema }), verifyEmailHandler);
authRouter.post(
  "/forgot-password",
  validate({ body: forgotPasswordSchema }),
  forgotPasswordHandler,
);
authRouter.post("/reset-password", validate({ body: resetPasswordSchema }), resetPasswordHandler);
adminAuthRouter.post("/login", validate({ body: adminLoginSchema }), adminLoginHandler);
