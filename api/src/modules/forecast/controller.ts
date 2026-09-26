import type { Request, Response } from "express";

import { unauthenticated } from "../../lib/problem.js";
import { getNextMonthForecast } from "./service.js";

function requireUserId(req: Request): string {
  if (!req.user?.id) {
    throw unauthenticated();
  }

  return req.user.id;
}

export async function getNextMonthForecastHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const data = await getNextMonthForecast(userId);
  res.status(200).json({ data });
}
