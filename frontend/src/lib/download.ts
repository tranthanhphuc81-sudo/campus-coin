/**
 * download.ts
 * Triggers a browser "Save As" for a `Blob` already fetched via `apiClient` — a Bearer-token API
 * response can't be linked to directly with a plain `<a href>`, so the file is fetched as a Blob
 * first and then handed to the browser through a throwaway object URL.
 * Exports: downloadBlob, filenameFromContentDisposition
 */

/** Saves `blob` to disk as `filename` using a throwaway anchor + object URL. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Matches `attachment; filename="name.ext"` (the exact shape every server endpoint here sends). */
const FILENAME_PATTERN = /filename\*?=(?:UTF-8''|")?([^";]+)"?/i;

/**
 * Extracts the filename from a `Content-Disposition: attachment; filename="..."` response header
 * (e.g. `GET /me/export`), falling back to `fallback` when the header is missing or unparsable —
 * a download must never fail just because a filename could not be determined.
 */
export function filenameFromContentDisposition(headerValue: string | undefined | null, fallback: string): string {
  if (!headerValue) return fallback;
  const match = FILENAME_PATTERN.exec(headerValue);
  return match?.[1] ? decodeURIComponent(match[1]) : fallback;
}
