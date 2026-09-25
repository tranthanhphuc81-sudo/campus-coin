import type { Request, Response } from "express";

import { unauthenticated } from "../../lib/problem.js";
import { createCategory, listCategories, patchCategory, removeCategory } from "./service.js";

function requireUserId(req: Request): string {
  if (!req.user?.id) {
    throw unauthenticated();
  }

  return req.user.id;
}

export async function listCategoriesHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const { type } = req.query as { type: "income" | "expense" };

  const categories = await listCategories(userId, type);
  res.status(200).json({ data: categories });
}

export async function createCategoryHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const created = await createCategory(userId, req.body);
  res.status(201).json(created);
}

export async function patchCategoryHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const { id } = req.params as { id: string };

  const updated = await patchCategory(userId, Number(id), req.body);
  res.status(200).json(updated);
}

export async function deleteCategoryHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const { id } = req.params as { id: string };
  const { reassignTo } = req.query as { reassignTo?: string };

  const deleted = await removeCategory(
    userId,
    Number(id),
    reassignTo ? Number(reassignTo) : undefined,
  );
  res.status(200).json(deleted);
}
