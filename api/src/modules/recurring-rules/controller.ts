import type { Request, Response } from "express";

import { unauthenticated } from "../../lib/problem.js";
import {
  addRecurringRule,
  disableRecurringRule,
  listRecurringRules,
  patchRecurringRule,
} from "./service.js";

function requireUserId(req: Request): string {
  if (!req.user?.id) {
    throw unauthenticated();
  }

  return req.user.id;
}

export async function listRecurringRulesHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const data = await listRecurringRules(userId);
  res.status(200).json({ data });
}

export async function createRecurringRuleHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const created = await addRecurringRule(userId, req.body);
  res.status(201).json(created);
}

export async function patchRecurringRuleHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const { id } = req.params as { id: string };
  const updated = await patchRecurringRule(userId, Number(id), req.body);
  res.status(200).json(updated);
}

export async function deleteRecurringRuleHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const { id } = req.params as { id: string };
  const result = await disableRecurringRule(userId, Number(id));
  res.status(200).json(result);
}
