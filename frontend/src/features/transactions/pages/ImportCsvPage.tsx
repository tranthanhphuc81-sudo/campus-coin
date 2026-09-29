/**
 * ImportCsvPage.tsx
 * Student CSV import wizard (`/app/transactions/import`): Upload -> Map & preview -> Result. The
 * in-progress batch id is kept in `?batch=` so a reload resumes the same import; which step shows
 * is driven entirely by the batch's own `status`, not local wizard state.
 * Exports: default (ImportCsvPage)
 * Spec: docs/spec/05a §5.5 (CSV import wizard)
 */
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { ImportBatchStatus, ImportRowFilter } from '@campuscoin/shared';
import { ErrorState } from '../../../components/ErrorState';
import { PageHeader } from '../../../components/PageHeader';
import { useToast } from '../../../components/ToastProvider';
import { en } from '../../../i18n/en';
import { MapPreviewStep } from '../../imports/components/MapPreviewStep';
import { ResultStep } from '../../imports/components/ResultStep';
import { UploadStep } from '../../imports/components/UploadStep';
import { useCommitImportMutation, useDiscardImportMutation, useImportBatchQuery } from '../../imports/hooks';

const STEP_LABELS = [en.transactions.import.steps.upload, en.transactions.import.steps.preview, en.transactions.import.steps.result];

/** Which of the 3 wizard steps is current, purely a function of the batch's status. */
function stepIndexFor(status: string | undefined): number {
  if (status === ImportBatchStatus.COMMITTED) return 2;
  if (status === ImportBatchStatus.PREVIEWED || status === ImportBatchStatus.PARSING || status === ImportBatchStatus.UPLOADED) return 1;
  return 0;
}

/** Stepper shown above the current step's card. */
function WizardSteps({ current }: { current: number }) {
  return (
    <ol className="nav nav-pills mb-4" aria-label="Import steps">
      {STEP_LABELS.map((label, index) => (
        <li key={label} className="nav-item">
          <span className={`nav-link${index === current ? ' active' : ''}`} aria-current={index === current ? 'step' : undefined}>
            {index + 1}. {label}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Student CSV import wizard, driven by the current batch's server-side status. */
export default function ImportCsvPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const batchId = searchParams.get('batch');
  const { showToast } = useToast();

  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<ImportRowFilter>(ImportRowFilter.ALL);

  const batchQuery = useImportBatchQuery(batchId, { page, filter });
  const commitMutation = useCommitImportMutation(batchId ?? '');
  const discardMutation = useDiscardImportMutation();

  const batch = batchQuery.data;

  function startNew() {
    setPage(1);
    setFilter(ImportRowFilter.ALL);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('batch');
      return next;
    });
  }

  function handleUploaded(newBatchId: string) {
    setPage(1);
    setFilter(ImportRowFilter.ALL);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('batch', newBatchId);
      return next;
    });
  }

  function handleFilterChange(nextFilter: ImportRowFilter) {
    setFilter(nextFilter);
    setPage(1);
  }

  function handleCommit() {
    commitMutation.mutate(undefined, {
      onError: () => showToast({ message: en.transactions.import.errors.generic }),
    });
  }

  function handleDiscard() {
    if (!batchId) return;
    discardMutation.mutate(batchId, { onSuccess: startNew });
  }

  return (
    <>
      <PageHeader title={en.transactions.import.pageTitle} subtitle={en.transactions.import.subtitle} />
      <WizardSteps current={stepIndexFor(batch?.status)} />

      {!batchId ? (
        <UploadStep onUploaded={handleUploaded} />
      ) : batchQuery.isLoading ? (
        <div className="card">
          <div className="card-body p-5 text-center">
            <span className="spinner-border text-primary" role="status" aria-hidden="true" />
            <p className="mt-3 mb-0">{en.transactions.import.preview.parsing}</p>
          </div>
        </div>
      ) : batchQuery.isError || !batch ? (
        <ErrorState onRetry={() => void batchQuery.refetch()} />
      ) : batch.status === ImportBatchStatus.UPLOADED || batch.status === ImportBatchStatus.PARSING ? (
        <div className="card">
          <div className="card-body p-5 text-center">
            <span className="spinner-border text-primary" role="status" aria-hidden="true" />
            <p className="mt-3 mb-0">{en.transactions.import.preview.parsing}</p>
          </div>
        </div>
      ) : batch.status === ImportBatchStatus.FAILED ? (
        <ErrorState message={batch.failure?.message ?? en.transactions.import.failedTitle} onRetry={startNew} />
      ) : batch.status === ImportBatchStatus.EXPIRED ? (
        <div className="card">
          <div className="card-body p-4 text-center">
            <h2 className="h5">{en.transactions.import.expiredTitle}</h2>
            <p className="text-body-secondary">{en.transactions.import.expiredBody}</p>
            <button type="button" className="btn btn-primary" onClick={startNew}>
              {en.transactions.import.startOver}
            </button>
          </div>
        </div>
      ) : batch.status === ImportBatchStatus.COMMITTED ? (
        <ResultStep batch={batch} onStartNew={startNew} />
      ) : (
        <MapPreviewStep
          batchId={batchId}
          batch={batch}
          page={page}
          filter={filter}
          onPageChange={setPage}
          onFilterChange={handleFilterChange}
          onCommit={handleCommit}
          onDiscard={handleDiscard}
          isCommitting={commitMutation.isPending}
        />
      )}
    </>
  );
}
