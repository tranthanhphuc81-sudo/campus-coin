import type { Request, Response } from "express";

import { unauthenticated } from "../../lib/problem.js";
import {
  addTransaction,
  listTransactions,
  patchTransaction,
  removeTransaction,
} from "./service.js";
import type {
  CreateTransactionInput,
  ListTransactionsQueryInput,
  UpdateTransactionInput,
} from "./types.js";

function requireUserId(req: Request): string {
  if (!req.user?.id) {
    throw unauthenticated();
  }

  return req.user.id;
}

export async function listTransactionsHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const query = req.query as ListTransactionsQueryInput;

  const data = await listTransactions(userId, query);
  res.status(200).json({ data });
}

export async function createTransactionHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const payload = req.body as CreateTransactionInput;

  const created = await addTransaction(userId, payload);
  res.status(201).json(created);
}

export async function patchTransactionHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const { id } = req.params as { id: string };
  const payload = req.body as UpdateTransactionInput;

  const updated = await patchTransaction(userId, id, payload);
  res.status(200).json(updated);
}

export async function deleteTransactionHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const { id } = req.params as { id: string };

  const result = await removeTransaction(userId, id);
  res.status(200).json(result);
}
