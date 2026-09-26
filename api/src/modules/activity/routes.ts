import { Router } from "express";

import { requireAuth } from "../../middlewares/auth.js";
import { getRecentActivityHandler } from "./controller.js";

export const activityRouter = Router();

activityRouter.use(requireAuth);
activityRouter.get("/recent", getRecentActivityHandler);
