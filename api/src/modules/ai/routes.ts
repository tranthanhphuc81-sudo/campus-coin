import { Router } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

import { requireAuth } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
import { rateLimited } from "../../lib/problem.js";

import { aiFeedbackHandler, suggestCategoryHandler } from "./controller.js";
import { feedbackBodySchema, suggestBodySchema } from "./schema.js";

export const aiRouter = Router();

const suggestRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? ipKeyGenerator(req.ip ?? ""),
  handler: (_req, _res, next) => {
    next(rateLimited("You can request AI suggestions at most 60 times per minute."));
  },
});

aiRouter.use(requireAuth);
aiRouter.post(
  "/categorize/suggest",
  suggestRateLimiter,
  validate({ body: suggestBodySchema }),
  suggestCategoryHandler,
);
aiRouter.post("/feedback", validate({ body: feedbackBodySchema }), aiFeedbackHandler);
