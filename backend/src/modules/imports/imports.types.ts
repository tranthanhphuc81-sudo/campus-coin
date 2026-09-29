/**
 * imports.types.ts
 * Internal types for the CSV import module — never exposed to `@campuscoin/shared` (the public
 * DTOs live there, see `imports.mapper.ts`). `StoredPreview` is the exact shape persisted to Redis
 * by `imports.store.ts` between the `import.parse` job and every later `GET`/`PATCH`/commit call.
 * Main exports: StoredRowError, StoredRow, StoredRowDraft, StoredPreviewOptions, StoredPreview,
 *   StoredOverride, ImportParseJobData
 * Spec: docs/spec/05a §5.5 (CSV import)
 */
import type { ImportCategoryOrigin, ImportColumnMappingInput, ImportDateFormat, TransactionType } from '@campuscoin/shared';
import type { AiTier } from '@campuscoin/shared';

/** One field-level error attached to a row (mirrors `ImportRowError` from `@campuscoin/shared`). */
export interface StoredRowError {
  field: string;
  message: string;
}

/** Raw (un-normalised) cell text for the 5 canonical columns, exactly as read from the CSV. */
export interface StoredRawCells {
  date: string | null;
  amount: string | null;
  type: string | null;
  description: string | null;
  category: string | null;
}

/**
 * Output of `imports.normalize.ts`'s `buildRow`, before category/AI/duplicate resolution
 * (`imports.service.ts`'s `parseBatch` fills in the rest to produce a {@link StoredRow}).
 */
export interface StoredRowDraft {
  rowNumber: number;
  raw: StoredRawCells;
  txnDate: string | null;
  amount: string | null;
  type: TransactionType | null;
  description: string | null;
  errors: StoredRowError[];
}

/** One fully-resolved preview row, as persisted in Redis (before any `overrides` are applied). */
export interface StoredRow extends StoredRowDraft {
  categoryId: number | null;
  categoryName: string | null;
  categoryOrigin: ImportCategoryOrigin | null;
  aiSuggestedCategoryId: number | null;
  aiConfidence: string | null;
  aiTier: AiTier | null;
  isDuplicate: boolean;
  needsReview: boolean;
  /** Baseline selection before `overrides` are applied — `true` for every error-free, non-duplicate row. */
  selected: boolean;
}

/** Parse options a batch was last parsed with (delimiter is auto-detected, never user-chosen). */
export interface StoredPreviewOptions {
  delimiter: ',' | ';';
  dateFormat: ImportDateFormat;
  mapping: ImportColumnMappingInput;
}

/** A user's row-level edit from `PATCH /imports/:id/rows`, keyed by `rowNumber` (survives a re-parse). */
export interface StoredOverride {
  categoryId?: number;
  /** Display name of `categoryId`, resolved once at edit time so a re-render never re-fetches it. */
  categoryName?: string;
  selected?: boolean;
}

/**
 * The entire parsed preview of one import batch, as stored in Redis at `import:{batchId}` (TTL
 * pinned to `createdAt + IMPORT_PREVIEW_TTL_SEC`, never extended by a re-parse).
 */
export interface StoredPreview {
  userId: string;
  /** Bumped on every `options` re-parse; `parseBatch` drops a stale job whose `rev` no longer matches. */
  rev: number;
  options: StoredPreviewOptions;
  headers: string[];
  failure: { code: string; message: string } | null;
  rows: StoredRow[];
  /** Row edits from `PATCH /imports/:id/rows`, re-applied by `rowNumber` after every (re-)parse. */
  overrides: Record<number, StoredOverride>;
}

/** Job data for the `import.parse` queue (`imports.jobs.ts`'s `enqueueImportParse`). */
export interface ImportParseJobData {
  batchId: string;
  userId: string;
  rev: number;
}

/** One row of `ImportErrorReport.errorRows` — enough to render/export a per-row error without the full preview. */
export interface ErrorReportRow {
  rowNumber: number;
  date: string | null;
  amount: string | null;
  type: string | null;
  description: string | null;
  category: string | null;
  errors: string[];
}

/**
 * Summary persisted to `ImportBatch.errorReport` (MySQL) once parsing finishes — unlike
 * `StoredPreview`, this survives the Redis preview's 24h TTL, so `GET /imports/:id/errors.csv`
 * keeps working after the preview itself has expired. `fatal` is set instead of `errorRows` when
 * the whole file failed to parse (e.g. too many rows/columns, malformed CSV).
 */
export interface ImportErrorReport {
  errorRows?: ErrorReportRow[];
  fatal?: { code: string; message: string };
}
