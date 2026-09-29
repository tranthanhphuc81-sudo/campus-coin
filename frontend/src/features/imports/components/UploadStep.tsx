/**
 * UploadStep.tsx
 * First step of the CSV import wizard: drag-and-drop (or click-to-browse) file picker, upload
 * limits, and a link to download the sample CSV. Client-side extension/size checks give instant
 * feedback before the request even goes out; the server re-validates everything regardless.
 * Exports: UploadStep
 * Spec: docs/spec/05a §5.5 · docs/spec/09 §9.10 (file safety)
 */
import { useRef, useState } from 'react';
import { IMPORT_MAX_FILE_BYTES } from '@campuscoin/shared';
import type { ApiError } from '../../../lib/apiClient/apiError';
import { downloadBlob } from '../../../lib/download';
import { en } from '../../../i18n/en';
import { downloadImportTemplate } from '../api';
import { useUploadImportMutation } from '../hooks';

interface UploadStepProps {
  onUploaded: (batchId: string) => void;
}

/** Maps a failed upload's `ApiError` to a user-facing message. */
function uploadErrorMessage(error: ApiError): string {
  const t = en.transactions.import.errors;
  switch (error.status) {
    case 413:
      return t.upload413;
    case 415:
      return t.upload415;
    case 409:
      return t.upload409;
    case 422:
      return t.upload422;
    case 429:
      return t.upload429;
    default:
      return t.generic;
  }
}

/** Upload step: drag-and-drop/browse a CSV file, or download the sample template. */
export function UploadStep({ onUploaded }: UploadStepProps) {
  const t = en.transactions.import.upload;
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const uploadMutation = useUploadImportMutation();

  function validateAndUpload(file: File) {
    setClientError(null);
    if (!/\.csv$/i.test(file.name)) {
      setClientError(t.invalidExtension);
      return;
    }
    if (file.size > IMPORT_MAX_FILE_BYTES) {
      setClientError(t.tooLarge);
      return;
    }
    uploadMutation.mutate(file, {
      onSuccess: (result) => onUploaded(result.batchId),
    });
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragOver(false);
    const file = event.dataTransfer.files[0];
    if (file) validateAndUpload(file);
  }

  function handleFileInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) validateAndUpload(file);
    event.target.value = ''; // allow re-selecting the exact same file
  }

  async function handleDownloadTemplate() {
    const blob = await downloadImportTemplate();
    downloadBlob(blob, 'campuscoin-import-template.csv');
  }

  const errorMessage = clientError ?? (uploadMutation.error ? uploadErrorMessage(uploadMutation.error) : null);

  return (
    <div className="card">
      <div className="card-body p-4 p-md-5">
        <div
          className={`border border-2 rounded-3 p-5 text-center${isDragOver ? ' border-primary bg-primary-subtle' : ' border-dashed'}`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
        >
          <i className="bi bi-file-earmark-spreadsheet display-4 text-body-secondary" aria-hidden="true" />
          <p className="fw-semibold mt-3 mb-1">{t.dropzoneTitle}</p>
          <p className="text-body-secondary mb-3">{t.dropzoneHint}</p>
          <button type="button" className="btn btn-primary" onClick={() => inputRef.current?.click()} disabled={uploadMutation.isPending}>
            {uploadMutation.isPending ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
                {t.uploading}
              </>
            ) : (
              t.chooseFile
            )}
          </button>
          <input ref={inputRef} type="file" accept=".csv,text/csv" className="visually-hidden" onChange={handleFileInputChange} aria-label={t.chooseFile} />
        </div>

        {errorMessage ? (
          <div className="alert alert-danger mt-3 mb-0" role="alert">
            {errorMessage}
          </div>
        ) : null}

        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mt-4">
          <span className="text-body-secondary small">{t.limits}</span>
          <button type="button" className="btn btn-link p-0" onClick={() => void handleDownloadTemplate()}>
            <i className="bi bi-download me-1" aria-hidden="true" />
            {t.downloadTemplate}
          </button>
        </div>
      </div>
    </div>
  );
}
