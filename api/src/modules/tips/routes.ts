import { Router } from "express";

import { requireAuth } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
import {
  dismissTipHandler,
  listTipsHandler,
  pinTipHandler,
  unpinTipHandler,
} from "./controller.js";
import { tipIdParamsSchema } from "./schema.js";

export const tipsRouter = Router();

tipsRouter.use(requireAuth);
tipsRouter.get("/", listTipsHandler);
tipsRouter.post("/:id/pin", validate({ params: tipIdParamsSchema }), pinTipHandler);
tipsRouter.post("/:id/unpin", validate({ params: tipIdParamsSchema }), unpinTipHandler);
tipsRouter.post("/:id/dismiss", validate({ params: tipIdParamsSchema }), dismissTipHandler);
