import type { Request, Response } from "express";

import { unauthenticated } from "../../lib/problem.js";

import { categorizerService } from "./categorizer.service.js";
import type { FeedbackInput, SuggestCategoryInput } from "./types.js";

function requireUserId(req: Request): string {
  if (!req.user?.id) {
    throw unauthenticated();
  }

  return req.user.id;
}

export async function suggestCategoryHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const payload = req.body as Omit<SuggestCategoryInput, "userId">;

  const suggestion = await categorizerService.suggest({
    userId,
    description: payload.description,
    amount: payload.amount,
    type: payload.type,
  });

  if (!suggestion) {
    res.status(200).json({ suggestion: null });
    return;
  }

  res.status(200).json(suggestion);
}

export async function aiFeedbackHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const payload = req.body as Omit<FeedbackInput, "userId">;

  await categorizerService.submitFeedback({
    userId,
    description: payload.description,
    suggestedCategoryId: payload.suggestedCategoryId,
    chosenCategoryId: payload.chosenCategoryId,
  });

  res.status(204).send();
}
