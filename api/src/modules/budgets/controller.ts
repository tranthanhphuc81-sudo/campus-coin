import type { Request, Response } from "express";

import { unauthenticated } from "../../lib/problem.js";
import {
  copyPreviousMonthBudgets,
  getBudgetsForMonth,
  removeBudget,
  upsertBudgets,
} from "./service.js";

function requireUserId(req: Request): string {
  if (!req.user?.id) {
    throw unauthenticated();
  }

  return req.user.id;
}

export async function listBudgetsHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const { month } = req.query as { month: string };

  const data = await getBudgetsForMonth(userId, month);
  res.status(200).json({ data });
}

export async function upsertBudgetsHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const data = await upsertBudgets(userId, req.body);

  res.status(200).json({ data });
}

export async function copyPreviousBudgetsHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const result = await copyPreviousMonthBudgets(userId, req.body);

  res.status(200).json(result);
}

export async function deleteBudgetHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const id = Number(req.params.id);

  const result = await removeBudget(userId, id);
  res.status(200).json(result);
}
