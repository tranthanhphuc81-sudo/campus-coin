/**
 * api.ts
 * Thin wrappers around the P16 privacy/data-lifecycle endpoints used by Profile & Settings ›
 * Privacy: `GET /me/export` (fetched as a `Blob`, mirrors `features/reports/api.ts`'s PDF export)
 * and `DELETE /me` (account deletion request).
 * Exports: exportMyData, deleteAccount, DeleteAccountResponse, ExportResult
 * Spec: docs/spec/09 §9.14 (data lifecycle) · docs/spec/07 §7.3.1 (users/me)
 */
import type { DeleteAccountInput, ExportQueryInput } from '@campuscoin/shared';
import { apiClient } from '../../lib/apiClient/apiClient';
import { filenameFromContentDisposition } from '../../lib/download';

/** A downloaded export: the file itself plus the filename the server suggested for it. */
export interface ExportResult {
  blob: Blob;
  filename: string;
}

/** Response body of a successful `DELETE /me`. */
export interface DeleteAccountResponse {
  scheduledPurgeAt: string;
}

/** `today` as `YYYY-MM-DD`, used only for the client-side fallback filename. */
function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * `GET /me/export?format=json|csv` — the user's full data export, as a downloadable `Blob`.
 * `format=csv` comes back as a ZIP (`application/zip`); `format=json` as a single JSON document.
 * The caller triggers the actual "Save As" (see `lib/download.ts`'s `downloadBlob`).
 */
export async function exportMyData(format: ExportQueryInput['format']): Promise<ExportResult> {
  const response = await apiClient.get<Blob>('/me/export', { params: { format }, responseType: 'blob' });
  const fallback = `campuscoin-export-${todayStamp()}.${format === 'csv' ? 'zip' : 'json'}`;
  // The response is read as a raw Blob, so the interceptor never gets to normalize a non-2xx body
  // into problem+json here — only the HTTP status (e.g. 429) is reliable for a blob-typed request.
  const filename = filenameFromContentDisposition(response.headers['content-disposition'] as string | undefined, fallback);
  return { blob: response.data, filename };
}

/**
 * `DELETE /me` — requests account deletion: re-authenticates with the current password and
 * requires the literal confirmation phrase (`deleteAccountSchema`). The server has already
 * disabled the account and cleared the refresh cookie by the time this resolves.
 */
export async function deleteAccount(input: DeleteAccountInput): Promise<DeleteAccountResponse> {
  const response = await apiClient.delete<DeleteAccountResponse>('/me', { data: input });
  return response.data;
}
