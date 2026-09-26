import type { Request, Response } from "express";

import { unauthenticated } from "../../lib/problem.js";
import { getNotifications, readAllNotifications, readNotification } from "./service.js";

function requireUserId(req: Request): string {
  if (!req.user?.id) {
    throw unauthenticated();
  }

  return req.user.id;
}

export async function listNotificationsHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const page = Number(req.query.page);
  const limit = Number(req.query.limit);

  const result = await getNotifications({ userId, page, limit });
  res.status(200).json(result);
}

export async function readNotificationHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const id = BigInt(String(req.params.id));

  const result = await readNotification({ userId, id });
  res.status(200).json(result);
}

export async function readAllNotificationsHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);

  const result = await readAllNotifications(userId);
  res.status(200).json(result);
}
