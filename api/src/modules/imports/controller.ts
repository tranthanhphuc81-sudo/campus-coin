import type { Request, Response } from "express";

import { unauthenticated, unsupportedMediaType } from "../../lib/problem.js";
import { importUploadBodySchema } from "./schema.js";
import {
  buildCsvTemplate,
  buildImportErrorReportCsv,
  commitImport,
  createImportPreview,
  getImportBatch,
  removeImportBatch,
  updateImportRows,
} from "./service.js";
import type { ImportRowsPatchInput } from "./types.js";

function requireUserId(req: Request): string {
  if (!req.user?.id) {
    throw unauthenticated();
  }

  return req.user.id;
}

export async function getImportTemplateHandler(_req: Request, res: Response): Promise<void> {
  const result = buildCsvTemplate();
  res
    .status(200)
    .setHeader("Content-Type", "text/csv; charset=utf-8")
    .setHeader("Content-Disposition", `attachment; filename="${result.fileName}"`)
    .send(result.content);
}

export async function uploadImportHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const body = importUploadBodySchema.parse(req.body);

  const file = req.file;
  if (!file) {
    throw unsupportedMediaType("A CSV file is required.");
  }

  const batch = await createImportPreview({
    userId,
    dateFormat: body.dateFormat,
    file: {
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      buffer: file.buffer,
    },
  });

  res.status(200).json(batch);
}

export async function getImportBatchHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const { id } = req.params as { id: string };

  const batch = await getImportBatch(userId, id);
  res.status(200).json(batch);
}

export async function patchImportRowsHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const { id } = req.params as { id: string };
  const payload = req.body as ImportRowsPatchInput;

  const batch = await updateImportRows(userId, id, payload);
  res.status(200).json(batch);
}

export async function commitImportHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const { id } = req.params as { id: string };
  const idempotencyKey = req.header("Idempotency-Key");

  const result = await commitImport(userId, id, idempotencyKey ?? null);
  res.status(200).json(result);
}

export async function deleteImportBatchHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const { id } = req.params as { id: string };

  await removeImportBatch(userId, id);
  res.status(204).send();
}

export async function downloadImportErrorReportHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const { id } = req.params as { id: string };

  const report = await buildImportErrorReportCsv(userId, id);
  res
    .status(200)
    .setHeader("Content-Type", "text/csv; charset=utf-8")
    .setHeader("Content-Disposition", `attachment; filename="import-errors-${id}.csv"`)
    .send(report);
}
