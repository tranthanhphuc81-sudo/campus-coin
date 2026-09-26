import { Router } from "express";

import { requireAuth } from "../../middlewares/auth.js";
import { getNextMonthForecastHandler } from "./controller.js";

export const forecastRouter = Router();

forecastRouter.use(requireAuth);
forecastRouter.get("/next-month", getNextMonthForecastHandler);
