/**
 * imports.mapper.ts
 * Maps internal `ImportBatch`/`StoredPreview`/`StoredRow` shapes to the public `@campuscoin/shared`
 * DTOs. Never exposes `userId`, `fileSha256` or the internal `rev` counter.
 * Main exports: toImportRowDto, toImportBatchDto
 * Spec: docs/spec/05a §5.5 · docs/spec/07 §7.3.2
 */
import { IMPORT_PREVIEW_TTL_SEC, type ImportBatchDto, type ImportPreviewRowDto } from '@campuscoin/shared';
import type { ImportBatchModel } from '../../generated/prisma/models/ImportBatch.js';
import type { PaginationMeta } from '../../lib/pagination.js';
import type { ImportErrorReport, StoredPreview, StoredRow } from './imports.types.js';

/** One page of rows, already override-applied and filtered by the caller (`imports.service.ts`). */
export interface ImportRowPage {
  data: StoredRow[];
  meta: PaginationMeta;
}

/** Maps one resolved (override-applied) row to its public DTO shape. */
export function toImportRowDto(row: StoredRow): ImportPreviewRowDto {
  return {
    rowNumber: row.rowNumber,
    raw: row.raw,
    txnDate: row.txnDate,
    amount: row.amount,
    type: row.type,
    description: row.description,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    categoryOrigin: row.categoryOrigin,
    aiSuggestedCategoryId: row.aiSuggestedCategoryId,
    aiConfidence: row.aiConfidence,
    aiTier: row.aiTier,
    errors: row.errors,
    isDuplicate: row.isDuplicate,
    needsReview: row.needsReview,
    selected: row.selected,
  };
}

/**
 * Builds the full `GET /imports/:id` response. `effectiveRows` (override-applied, full list) is
 * used only to compute the summary counts — `page` is the already-paginated/filtered slice of the
 * same rows. Both are `null` once the Redis preview has expired (the batch's own `totalRows`/
 * `validRows` columns are the only counts still available then).
 */
export function toImportBatchDto(
  batch: ImportBatchModel,
  preview: StoredPreview | null,
  effectiveRows: StoredRow[] | null,
  page: ImportRowPage | null,
): ImportBatchDto {
  const errorRows = effectiveRows ? effectiveRows.filter((r) => r.errors.length > 0).length : Math.max(batch.totalRows - batch.validRows, 0);
  const duplicateRows = effectiveRows ? effectiveRows.filter((r) => r.isDuplicate).length : 0;
  const needsReviewRows = effectiveRows ? effectiveRows.filter((r) => r.needsReview).length : 0;
  const selectedRows = effectiveRows ? effectiveRows.filter((r) => r.selected).length : 0;
  const report = batch.errorReport as unknown as ImportErrorReport | null;

  return {
    id: batch.id,
    status: batch.status,
    originalFilename: batch.originalFilename,
    totalRows: batch.totalRows,
    validRows: batch.validRows,
    errorRows,
    duplicateRows,
    needsReviewRows,
    selectedRows,
    committedRows: batch.committedRows,
    createdAt: batch.createdAt.toISOString(),
    committedAt: batch.committedAt ? batch.committedAt.toISOString() : null,
    expiresAt: batch.status === 'committed' ? null : new Date((Math.floor(batch.createdAt.getTime() / 1000) + IMPORT_PREVIEW_TTL_SEC) * 1000).toISOString(),
    failure: report?.fatal ?? null,
    headers: preview?.headers ?? [],
    options: preview ? preview.options : null,
    rows: page ? { data: page.data.map(toImportRowDto), meta: page.meta } : null,
  };
}
