import type { Request, Response } from "express";

import { unauthenticated } from "../../lib/problem.js";
import { getInsightByMonth, listInsights, queueInsightRegeneration } from "./insight.service.js";

function requireUserId(req: Request): string {
  if (!req.user?.id) {
    throw unauthenticated();
  }

  return req.user.id;
}

export async function listInsightsHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const data = await listInsights(userId);
  res.status(200).json({ data });
}

export async function getInsightByMonthHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const { month } = req.params as { month: string };

  const data = await getInsightByMonth({ userId, month });
  res.status(200).json({ data });
}

export async function regenerateInsightHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const { month } = req.params as { month: string };

  await queueInsightRegeneration({ userId, month });
  res.status(202).json({ data: { accepted: true } });
}
