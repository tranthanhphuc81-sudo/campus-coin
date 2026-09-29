/**
 * api.ts
 * Thin wrappers around `/imports/*`: upload (multipart), status/preview, row edits, commit,
 * discard, and the two CSV downloads (template + error report).
 * Exports: uploadImport, getImportBatch, updateImportRows, commitImport, discardImport,
 *   downloadImportTemplate, downloadImportErrors
 * Spec: docs/spec/05a §5.5 (CSV import) · docs/spec/07 §7.3.2
 */
import type { ImportBatchDto, ImportBatchQueryInput, ImportCommitResultDto, ImportUploadResultDto, UpdateImportRowsInput } from '@campuscoin/shared';
import { apiClient } from '../../lib/apiClient/apiClient';

/**
 * `POST /imports` (multipart, field `file`) — 202 `{batchId, status}`.
 * @param file - The CSV file, as picked/dropped by the user.
 */
export async function uploadImport(file: File): Promise<ImportUploadResultDto> {
  const formData = new FormData();
  // Re-wrap as an explicit `text/csv` File: some browsers report a `.csv` file's type as
  // `application/vnd.ms-excel` (or leave it blank), which the server's strict MIME check rejects.
  const csvFile = new File([file], file.name, { type: 'text/csv' });
  formData.append('file', csvFile);
  const response = await apiClient.post<ImportUploadResultDto>('/imports', formData);
  return response.data;
}

/** `GET /imports/:id` — status + paginated/filterable preview. */
export async function getImportBatch(id: string, query: Partial<ImportBatchQueryInput> = {}): Promise<ImportBatchDto> {
  const response = await apiClient.get<ImportBatchDto>(`/imports/${id}`, { params: query });
  return response.data;
}

/** `PATCH /imports/:id/rows` — column mapping/date format (triggers a re-parse) or row edits. */
export async function updateImportRows(id: string, input: UpdateImportRowsInput): Promise<{ status: string }> {
  const response = await apiClient.patch<{ status: string }>(`/imports/${id}/rows`, input);
  return response.data;
}

/** `POST /imports/:id/commit`. `idempotencyKey` should be a fresh UUID per submit attempt. */
export async function commitImport(id: string, idempotencyKey: string): Promise<ImportCommitResultDto> {
  const response = await apiClient.post<ImportCommitResultDto>(`/imports/${id}/commit`, undefined, {
    headers: { 'Idempotency-Key': idempotencyKey },
  });
  return response.data;
}

/** `DELETE /imports/:id` — discards a not-yet-committed batch. */
export async function discardImport(id: string): Promise<void> {
  await apiClient.delete(`/imports/${id}`);
}

/** `GET /imports/template` — the downloadable sample CSV, as a Blob (see `lib/download.ts`). */
export async function downloadImportTemplate(): Promise<Blob> {
  const response = await apiClient.get<Blob>('/imports/template', { responseType: 'blob' });
  return response.data;
}

/** `GET /imports/:id/errors.csv` — the downloadable per-row error report, as a Blob. */
export async function downloadImportErrors(id: string): Promise<Blob> {
  const response = await apiClient.get<Blob>(`/imports/${id}/errors.csv`, { responseType: 'blob' });
  return response.data;
}
