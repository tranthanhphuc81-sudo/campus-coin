/**
 * ResultStep.tsx
 * Final step of the CSV import wizard: success/error row counts, an error-report download (only
 * when there were errors), and links to view the imported transactions or start another import.
 * Exports: ResultStep
 * Spec: docs/spec/05a §5.5
 */
import type { ImportBatchDto } from '@campuscoin/shared';
import { Link } from 'react-router';
import { downloadBlob } from '../../../lib/download';
import { en } from '../../../i18n/en';
import { downloadImportErrors } from '../api';

interface ResultStepProps {
  batch: ImportBatchDto;
  onStartNew: () => void;
}

/** Result step: shows the finished commit's outcome and next actions. */
export function ResultStep({ batch, onStartNew }: ResultStepProps) {
  const t = en.transactions.import.result;

  async function handleDownloadErrors() {
    const blob = await downloadImportErrors(batch.id);
    downloadBlob(blob, `import-errors-${batch.id}.csv`);
  }

  return (
    <div className="card">
      <div className="card-body p-4 p-md-5 text-center">
        <i className="bi bi-check-circle display-4 text-bc-income" aria-hidden="true" />
        <h2 className="h4 mt-3">{t.title}</h2>
        <p className="mb-1">{t.committed(batch.committedRows)}</p>
        {batch.errorRows > 0 ? <p className="text-bc-expense mb-3">{t.errors(batch.errorRows)}</p> : null}

        <div className="d-flex flex-wrap justify-content-center gap-2 mt-4">
          {batch.errorRows > 0 ? (
            <button type="button" className="btn btn-outline-secondary" onClick={() => void handleDownloadErrors()}>
              <i className="bi bi-download me-1" aria-hidden="true" />
              {t.downloadErrors}
            </button>
          ) : null}
          <Link to="/app/transactions" className="btn btn-primary">
            {t.viewTransactions}
          </Link>
          <button type="button" className="btn btn-link" onClick={onStartNew}>
            {t.startNew}
          </button>
        </div>
      </div>
    </div>
  );
}
