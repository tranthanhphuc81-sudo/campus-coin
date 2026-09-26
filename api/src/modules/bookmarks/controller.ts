import type { Request, Response } from "express";

import { unauthenticated } from "../../lib/problem.js";
import {
  createBookmarkForUser,
  deleteBookmarkForUser,
  listBookmarks,
  updateBookmarkForUser,
} from "./service.js";
import type { DeleteBookmarkInput, ListBookmarksInput, UpsertBookmarkInput } from "./types.js";

function requireUserId(req: Request): string {
  if (!req.user?.id) {
    throw unauthenticated();
  }

  return req.user.id;
}

export async function listBookmarksHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const query = req.query as ListBookmarksInput;
  const data = await listBookmarks(userId, query);
  res.status(200).json({ data });
}

export async function createBookmarkHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const body = req.body as UpsertBookmarkInput;
  const data = await createBookmarkForUser(userId, body);
  res.status(201).json({ data });
}

export async function patchBookmarkHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const body = req.body as UpsertBookmarkInput;
  const data = await updateBookmarkForUser(userId, body);
  res.status(200).json({ data });
}

export async function deleteBookmarkHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const body = req.body as DeleteBookmarkInput;
  await deleteBookmarkForUser(userId, body);
  res.status(200).json({ data: { success: true } });
}
