/**
 * hooks.ts
 * TanStack Query hooks for the CSV import wizard: upload, polling the preview while the backend
 * is still parsing (`IMPORT_POLL_INTERVAL_MS`), row edits, commit and discard.
 * Exports: importBatchQueryKey, useImportBatchQuery, useUploadImportMutation,
 *   useUpdateImportRowsMutation, useCommitImportMutation, useDiscardImportMutation
 * Spec: docs/spec/05a §5.5 (CSV import)
 */
import {
  IMPORT_POLL_INTERVAL_MS,
  ImportBatchStatus,
  type ImportBatchDto,
  type ImportBatchQueryInput,
  type ImportCommitResultDto,
  type ImportUploadResultDto,
  type UpdateImportRowsInput,
} from '@campuscoin/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiError } from '../../lib/apiClient/apiError';
import { commitImport, discardImport, getImportBatch, updateImportRows, uploadImport } from './api';

/** Statuses where the backend is still working — the query keeps polling while in one of these. */
const PARSING_STATUSES: readonly string[] = [ImportBatchStatus.UPLOADED, ImportBatchStatus.PARSING];

/** Query key for one import batch, scoped by its page/filter params. */
export function importBatchQueryKey(id: string, query: Partial<ImportBatchQueryInput>) {
  return ['imports', id, query] as const;
}

/**
 * Reads one import batch, polling every {@link IMPORT_POLL_INTERVAL_MS} while it is still
 * `uploaded`/`parsing`; stops polling once it reaches `previewed`/`committed`/`failed`/`expired`.
 */
export function useImportBatchQuery(id: string | null, query: Partial<ImportBatchQueryInput> = {}) {
  return useQuery<ImportBatchDto>({
    queryKey: importBatchQueryKey(id ?? '', query),
    queryFn: () => getImportBatch(id as string, query),
    enabled: id !== null,
    refetchInterval: (q) => (PARSING_STATUSES.includes(q.state.data?.status ?? '') ? IMPORT_POLL_INTERVAL_MS : false),
  });
}

/** `POST /imports` (multipart upload). */
export function useUploadImportMutation() {
  return useMutation<ImportUploadResultDto, ApiError, File>({ mutationFn: (file) => uploadImport(file) });
}

/** `PATCH /imports/:id/rows` — invalidates the batch query on success so the preview reflects the edit. */
export function useUpdateImportRowsMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation<{ status: string }, ApiError, UpdateImportRowsInput>({
    mutationFn: (input) => updateImportRows(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['imports', id] }),
  });
}

/** `POST /imports/:id/commit`, with a fresh `Idempotency-Key` per attempt. */
export function useCommitImportMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation<ImportCommitResultDto, ApiError, void>({
    mutationFn: () => commitImport(id, crypto.randomUUID()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['imports', id] });
      void queryClient.invalidateQueries({ queryKey: ['transactions'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['budgets'] });
    },
  });
}

/** `DELETE /imports/:id`. */
export function useDiscardImportMutation() {
  return useMutation<void, ApiError, string>({ mutationFn: (id) => discardImport(id) });
}
