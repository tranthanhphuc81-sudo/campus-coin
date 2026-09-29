/**
 * imports.controller.ts
 * HTTP <-> DTO glue for `/api/v1/imports`. Reads parsed input from `req.validated`, the uploaded
 * file from `req.file` (memory storage — see `imports.upload.ts`), and the caller's identity from
 * `req.auth`. All business logic lives in `imports.service.ts`.
 * Main exports: getTemplate, uploadImport, getImportBatch, updateImportRows, discardImport,
 *   commitImport, getImportErrorsCsv
 * Spec: docs/spec/07 §7.3.2 (imports)
 */
import type { ImportBatchQueryInput, UpdateImportRowsInput, UuidParamInput } from '@campuscoin/shared';
import type { Response, RequestHandler } from 'express';
import * as importsService from './imports.service.js';

/** Sends a CSV document with the download headers docs/spec/09 §9.10 requires for every file export. */
function sendCsv(res: Response, filename: string, csv: string): void {
  res.status(200);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(csv);
}

/** `GET /imports/template` — downloadable sample CSV. */
export const getTemplate: RequestHandler = (_req, res) => {
  sendCsv(res, 'campuscoin-import-template.csv', importsService.templateCsv());
};

/** `POST /imports` — uploads a CSV (multipart, field `file`); 202 `{batchId, status}`. */
export const uploadImport: RequestHandler = async (req, res) => {
  const result = await importsService.upload(req.auth!.userId, req.file!);
  res.status(202).json(result);
};

/** `GET /imports/:id` — status + paginated/filterable preview. */
export const getImportBatch: RequestHandler = async (req, res) => {
  const params = req.validated?.params as UuidParamInput;
  const query = req.validated?.query as ImportBatchQueryInput;
  const result = await importsService.get(req.auth!.userId, params.id, query);
  res.status(200).json(result);
};

/** `PATCH /imports/:id/rows` — column mapping/date format (re-parses, 202) or row edits (200). */
export const updateImportRows: RequestHandler = async (req, res) => {
  const params = req.validated?.params as UuidParamInput;
  const body = req.validated?.body as UpdateImportRowsInput;
  const result = await importsService.updateRows(req.auth!.userId, params.id, body);
  res.status(result.status === 'parsing' ? 202 : 200).json(result);
};

/** `DELETE /imports/:id` — discards a not-yet-committed batch. */
export const discardImport: RequestHandler = async (req, res) => {
  const params = req.validated?.params as UuidParamInput;
  await importsService.discard(req.auth!.userId, params.id);
  res.status(204).end();
};

/** `POST /imports/:id/commit` — writes every selected row in one DB transaction. */
export const commitImport: RequestHandler = async (req, res) => {
  const params = req.validated?.params as UuidParamInput;
  const result = await importsService.commit(req.auth!.userId, params.id, { ip: req.ip, userAgent: req.header('user-agent') });
  res.status(200).json(result);
};

/** `GET /imports/:id/errors.csv` — downloadable per-row error report. */
export const getImportErrorsCsv: RequestHandler = async (req, res) => {
  const params = req.validated?.params as UuidParamInput;
  const csv = await importsService.buildErrorsCsv(req.auth!.userId, params.id);
  sendCsv(res, `import-errors-${params.id}.csv`, csv);
};
