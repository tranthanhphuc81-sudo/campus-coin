import type { Request, Response } from "express";

import { unauthenticated } from "../../lib/problem.js";
import { dismissTip, listTips, pinTip, unpinTip } from "./service.js";

function requireUserId(req: Request): string {
  if (!req.user?.id) {
    throw unauthenticated();
  }

  return req.user.id;
}

export async function listTipsHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const data = await listTips(userId);
  res.status(200).json({ data });
}

export async function pinTipHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const { id } = req.params as { id: string };
  await pinTip(userId, id);
  res.status(200).json({ data: { success: true } });
}

export async function unpinTipHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const { id } = req.params as { id: string };
  await unpinTip(userId, id);
  res.status(200).json({ data: { success: true } });
}

export async function dismissTipHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const { id } = req.params as { id: string };
  await dismissTip(userId, id);
  res.status(200).json({ data: { success: true } });
}
