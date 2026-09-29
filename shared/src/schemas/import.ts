/**
 * import.ts
 * Zod schemas and DTO types for the CSV import wizard (`/imports/*`): column mapping, the
 * paginated preview list, per-row edits and the commit result. Bodies are `.strict()` so
 * unexpected fields — in particular `userId`, `categorySource`, `aiSuggestedCategoryId` on a
 * row — are rejected with 422 instead of silently ignored.
 * Main exports: importColumnMappingSchema, importBatchQuerySchema, updateImportRowsSchema
 *   + inferred *Input types, ImportPreviewRowDto, ImportBatchDto, ImportUploadResultDto,
 *   ImportCommitResultDto
 * Spec: docs/spec/05a §5.5 (CSV import) · docs/spec/09 §9.10 (file safety) · docs/spec/07 §7.3.2
 */
import { z } from 'zod';
import { ImportDateFormat, ImportRowFilter } from '../enums.js';
import type { CategorySource, ImportCategoryOrigin, TransactionType } from '../enums.js';
import { IMPORT_MAX_COLUMNS, IMPORT_ROWS_PATCH_MAX, PAGE_NUMBER_MAX, PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX } from '../constants.js';
import type { AiTier } from './ai.js';

/** Zero-based header-column index a `IMPORT_CSV_COLUMNS` field is mapped to; `null` = not present in the file. */
const columnIndex = z.number().int().min(0).max(IMPORT_MAX_COLUMNS - 1).nullable();

/** Maps each canonical import column to a zero-based index into the CSV's header row. */
export const importColumnMappingSchema = z
  .object({
    date: columnIndex,
    amount: columnIndex,
    type: columnIndex,
    description: columnIndex,
    category: columnIndex,
  })
  .strict()
  .refine((v) => v.date !== null && v.amount !== null && v.description !== null, {
    message: 'date, amount and description must all be mapped to a column.',
  });
/** Inferred input type of {@link importColumnMappingSchema}. */
export type ImportColumnMappingInput = z.infer<typeof importColumnMappingSchema>;

/** Query of `GET /imports/:id` — paginated, filterable preview. */
export const importBatchQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(PAGE_NUMBER_MAX).default(1), // B-L8: bounds an unbounded OFFSET.
    limit: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(PAGE_SIZE_DEFAULT),
    filter: z.enum(ImportRowFilter).default(ImportRowFilter.ALL),
  })
  .strict();
/** Inferred input type of {@link importBatchQuerySchema}. */
export type ImportBatchQueryInput = z.infer<typeof importBatchQuerySchema>;

/** One row edit accepted by `PATCH /imports/:id/rows`. */
const importRowEditSchema = z
  .object({
    rowNumber: z.number().int().min(2),
    categoryId: z.number().int().positive().optional(),
    selected: z.boolean().optional(),
  })
  .strict()
  .refine((v) => v.categoryId !== undefined || v.selected !== undefined, {
    message: 'Provide categoryId and/or selected.',
  });

/**
 * Body of `PATCH /imports/:id/rows`. Changing `options` (date format or column mapping) re-parses
 * the whole batch (status goes back to `parsing`, response is 202); row/selection edits apply
 * immediately against the current preview (response is 200).
 */
export const updateImportRowsSchema = z
  .object({
    options: z
      .object({
        dateFormat: z.enum(ImportDateFormat).optional(),
        mapping: importColumnMappingSchema.optional(),
      })
      .strict()
      .refine((v) => v.dateFormat !== undefined || v.mapping !== undefined, {
        message: 'Provide dateFormat and/or mapping.',
      })
      .optional(),
    rows: z.array(importRowEditSchema).max(IMPORT_ROWS_PATCH_MAX, `At most ${IMPORT_ROWS_PATCH_MAX} row edits per call.`).optional(),
    setAllSelected: z.boolean().optional(),
  })
  .strict()
  .refine((v) => v.options !== undefined || v.rows !== undefined || v.setAllSelected !== undefined, {
    message: 'Provide options, rows and/or setAllSelected.',
  });
/** Inferred input type of {@link updateImportRowsSchema}. */
export type UpdateImportRowsInput = z.infer<typeof updateImportRowsSchema>;

/** One field-level parse/validation error attached to a preview row. */
export interface ImportRowError {
  field: string;
  message: string;
}

/** One parsed CSV row in the Map & preview step. */
export interface ImportPreviewRowDto {
  rowNumber: number;
  raw: { date: string | null; amount: string | null; type: string | null; description: string | null; category: string | null };
  txnDate: string | null;
  amount: string | null;
  type: TransactionType | null;
  description: string | null;
  categoryId: number | null;
  categoryName: string | null;
  categoryOrigin: ImportCategoryOrigin | null;
  aiSuggestedCategoryId: number | null;
  aiConfidence: string | null;
  aiTier: AiTier | null;
  errors: ImportRowError[];
  isDuplicate: boolean;
  needsReview: boolean;
  selected: boolean;
}

/** Status/options/preview of a CSV import batch, as returned by `GET /imports/:id`. */
export interface ImportBatchDto {
  id: string;
  status: string;
  originalFilename: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  duplicateRows: number;
  needsReviewRows: number;
  selectedRows: number;
  committedRows: number;
  createdAt: string;
  committedAt: string | null;
  expiresAt: string | null;
  failure: { code: string; message: string } | null;
  headers: string[];
  options: { delimiter: ',' | ';'; dateFormat: ImportDateFormat; mapping: ImportColumnMappingInput } | null;
  rows: { data: ImportPreviewRowDto[]; meta: { page: number; limit: number; total: number; totalPages: number } } | null;
}

/** Response of `POST /imports` (202 Accepted). */
export interface ImportUploadResultDto {
  batchId: string;
  status: string;
}

/** Response of `POST /imports/:id/commit`. */
export interface ImportCommitResultDto {
  committedRows: number;
  errorRows: number;
  skippedRows: number;
  errorReportUrl: string | null;
}

/** Category source assigned to a committed import row (see `imports.service.ts`'s `commit`). */
export type ImportRowCategorySource = Extract<CategorySource, 'import' | 'user' | 'ai_accepted' | 'ai_overridden' | 'rule'>;
