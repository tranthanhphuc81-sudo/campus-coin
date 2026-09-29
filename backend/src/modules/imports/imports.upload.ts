/**
 * imports.upload.ts
 * Multer configuration + pure validation helpers for `POST /imports` (docs/spec/09 §9.10): memory
 * storage only (the raw file is NEVER written to disk), multer's own streaming `fileSize` limit
 * (it truncates/aborts the file stream mid-upload rather than buffering an oversized body), and
 * `MulterError` -> RFC 9457 status mapping.
 * Main exports: uploadCsv, assertCsvFile, decodeCsvText
 * Spec: docs/spec/09 §9.10 (file upload safety)
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import multer, { MulterError } from 'multer';
import { IMPORT_ALLOWED_MIME_TYPES, IMPORT_MAX_FILE_BYTES } from '@campuscoin/shared';
import { badRequest, payloadTooLarge, unsupportedMediaType, validationFailed } from '../../lib/problem.js';

/** Memory-storage only (BR: the raw upload is never written to disk); at most one file, no other fields/parts. */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: IMPORT_MAX_FILE_BYTES, files: 1, fields: 0, parts: 1 },
}).single('file');

/**
 * `POST /imports`'s file-upload middleware: streams the file into memory only (never disk) and
 * maps a `MulterError` to the right RFC 9457 status. `imports.controller.ts`'s `uploadImport`
 * reads the result from `req.file`.
 */
export const uploadCsv: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  upload(req, res, (err: unknown) => {
    if (err instanceof MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        next(payloadTooLarge(`File must be at most ${IMPORT_MAX_FILE_BYTES} bytes.`));
        return;
      }
      // LIMIT_UNEXPECTED_FILE / LIMIT_FILE_COUNT / LIMIT_FIELD_COUNT / LIMIT_PART_COUNT, etc.
      next(badRequest('Invalid file upload.'));
      return;
    }
    if (err) {
      next(err);
      return;
    }
    if (!req.file) {
      next(badRequest('No file uploaded.'));
      return;
    }
    next();
  });
};

/**
 * BR (docs/spec/09 §9.10): only a `.csv` extension (case-insensitive) and an accepted MIME type
 * (a `;charset=...` suffix is ignored) are accepted; an empty file has nothing to import.
 * @throws {AppError} 415 unsupported-media-type on extension/MIME; 422 on an empty file.
 */
export function assertCsvFile(file: { originalname: string; mimetype: string; size: number }): void {
  if (!/\.csv$/i.test(file.originalname)) {
    throw unsupportedMediaType('File must have a .csv extension.');
  }
  const mimeType = file.mimetype.split(';')[0]?.trim().toLowerCase() ?? '';
  if (!(IMPORT_ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType)) {
    throw unsupportedMediaType('File must be a CSV (text/csv).');
  }
  if (file.size === 0) {
    throw validationFailed([{ field: 'file', message: 'File is empty.' }]);
  }
}

/** C0 control characters other than tab/LF/CR — present only in binary data, never real CSV text. */
// eslint-disable-next-line no-control-regex -- intentionally targets control characters (binary detection).
const DISALLOWED_CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/;

/**
 * Decodes an uploaded file's bytes as strict UTF-8 text, stripping a leading BOM.
 * @throws {AppError} 415 unsupported-media-type when the bytes are not valid UTF-8, or contain a
 *   binary-only control character (docs/spec/09 §9.10: "reject binary bytes").
 */
export function decodeCsvText(buffer: Buffer): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    throw unsupportedMediaType('File is not valid UTF-8 text.');
  }
  if (DISALLOWED_CONTROL_CHARS.test(text)) {
    throw unsupportedMediaType('File is not valid UTF-8 text.');
  }
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}
