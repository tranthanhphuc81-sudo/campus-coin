/**
 * MapPreviewStep.tsx
 * Second step of the CSV import wizard: column mapping + date-format controls (re-parses on
 * "Apply"), filter tabs (All/Errors/Duplicates/Needs review), the editable preview table,
 * pagination, select-all/discard, and the commit action.
 * Exports: MapPreviewStep
 * Spec: docs/spec/05a §5.5
 */
import { useState } from 'react';
import { ImportDateFormat, ImportRowFilter, type ImportBatchDto, type ImportColumnMappingInput, type ImportDateFormat as ImportDateFormatType } from '@campuscoin/shared';
import { ConfirmModal } from '../../../components/ConfirmModal';
import { ErrorState } from '../../../components/ErrorState';
import { en } from '../../../i18n/en';
import { useUpdateImportRowsMutation } from '../hooks';
import { PreviewTable } from './PreviewTable';

interface MapPreviewStepProps {
  batchId: string;
  batch: ImportBatchDto;
  page: number;
  filter: ImportRowFilter;
  onPageChange: (page: number) => void;
  onFilterChange: (filter: ImportRowFilter) => void;
  onCommit: () => void;
  onDiscard: () => void;
  isCommitting: boolean;
}

const FILTER_TABS: { value: ImportRowFilter; label: () => string }[] = [
  { value: ImportRowFilter.ALL, label: () => en.transactions.import.preview.filterAll },
  { value: ImportRowFilter.ERRORS, label: () => en.transactions.import.preview.filterErrors },
  { value: ImportRowFilter.DUPLICATES, label: () => en.transactions.import.preview.filterDuplicates },
  { value: ImportRowFilter.NEEDS_REVIEW, label: () => en.transactions.import.preview.filterNeedsReview },
];

/**
 * Column-mapping + date-format controls, seeded from the batch's current parse options.
 * The parent gives this a `key` derived from `batch.options`, so a completed re-parse remounts it
 * with fresh initial state instead of needing an effect to resync local state from props.
 */
function MappingForm({ batchId, headers, mapping, dateFormat }: { batchId: string; headers: string[]; mapping: ImportColumnMappingInput; dateFormat: ImportDateFormatType }) {
  const t = en.transactions.import.preview;
  const [draft, setDraft] = useState(mapping);
  const [draftDateFormat, setDraftDateFormat] = useState(dateFormat);
  const updateRows = useUpdateImportRowsMutation(batchId);

  function column(index: number | null): string {
    return index === null ? '' : String(index);
  }

  function requiredSelect(field: 'date' | 'amount' | 'description', label: string) {
    return (
      <div className="col-6 col-md-4 col-lg-2">
        <label className="form-label small" htmlFor={`import-map-${field}`}>
          {label}
        </label>
        <select
          id={`import-map-${field}`}
          className="form-select form-select-sm"
          value={column(draft[field])}
          onChange={(e) => setDraft((prev) => ({ ...prev, [field]: Number(e.target.value) }))}
        >
          {headers.map((header, index) => (
            <option key={index} value={index}>
              {header}
            </option>
          ))}
        </select>
      </div>
    );
  }

  function optionalSelect(field: 'type' | 'category', label: string) {
    return (
      <div className="col-6 col-md-4 col-lg-2">
        <label className="form-label small" htmlFor={`import-map-${field}`}>
          {label}
        </label>
        <select
          id={`import-map-${field}`}
          className="form-select form-select-sm"
          value={column(draft[field])}
          onChange={(e) => setDraft((prev) => ({ ...prev, [field]: e.target.value === '' ? null : Number(e.target.value) }))}
        >
          <option value="">{t.mapNone}</option>
          {headers.map((header, index) => (
            <option key={index} value={index}>
              {header}
            </option>
          ))}
        </select>
      </div>
    );
  }

  const hasChanges = draftDateFormat !== dateFormat || JSON.stringify(draft) !== JSON.stringify(mapping);

  return (
    <details className="mb-3">
      <summary className="fw-semibold">{t.mappingTitle}</summary>
      <p className="text-body-secondary small mt-2 mb-3">{t.mappingHint}</p>
      <div className="row g-2 align-items-end">
        {requiredSelect('date', t.mapDate)}
        {requiredSelect('amount', t.mapAmount)}
        {optionalSelect('type', t.mapType)}
        {requiredSelect('description', t.mapDescription)}
        {optionalSelect('category', t.mapCategory)}
        <div className="col-6 col-md-4 col-lg-2">
          <label className="form-label small" htmlFor="import-date-format">
            {t.dateFormat}
          </label>
          <select
            id="import-date-format"
            className="form-select form-select-sm"
            value={draftDateFormat}
            onChange={(e) => setDraftDateFormat(e.target.value as ImportDateFormatType)}
          >
            <option value={ImportDateFormat.YMD}>{t.dateFormatYmd}</option>
            <option value={ImportDateFormat.DMY}>{t.dateFormatDmy}</option>
            <option value={ImportDateFormat.MDY}>{t.dateFormatMdy}</option>
          </select>
        </div>
        <div className="col-12 col-lg-2">
          <button
            type="button"
            className="btn btn-outline-primary btn-sm w-100"
            disabled={!hasChanges || updateRows.isPending}
            onClick={() => updateRows.mutate({ options: { mapping: draft, dateFormat: draftDateFormat } })}
          >
            {t.applyMapping}
          </button>
        </div>
      </div>
    </details>
  );
}

/** Map & preview step: mapping controls, filter tabs, editable table, pagination, commit/discard. */
export function MapPreviewStep({ batchId, batch, page, filter, onPageChange, onFilterChange, onCommit, onDiscard, isCommitting }: MapPreviewStepProps) {
  const t = en.transactions.import.preview;
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [pendingRowNumbers, setPendingRowNumbers] = useState<Set<number>>(new Set());
  const updateRows = useUpdateImportRowsMutation(batchId);

  function handleToggleSelected(rowNumber: number, selected: boolean) {
    setPendingRowNumbers((prev) => new Set(prev).add(rowNumber));
    updateRows.mutate(
      { rows: [{ rowNumber, selected }] },
      {
        onSettled: () =>
          setPendingRowNumbers((prev) => {
            const next = new Set(prev);
            next.delete(rowNumber);
            return next;
          }),
      },
    );
  }

  function handleChangeCategory(rowNumber: number, categoryId: number) {
    setPendingRowNumbers((prev) => new Set(prev).add(rowNumber));
    updateRows.mutate(
      { rows: [{ rowNumber, categoryId }] },
      {
        onSettled: () =>
          setPendingRowNumbers((prev) => {
            const next = new Set(prev);
            next.delete(rowNumber);
            return next;
          }),
      },
    );
  }

  const rows = batch.rows?.data ?? [];
  const meta = batch.rows?.meta;

  return (
    <div className="card">
      <div className="card-body p-4">
        {batch.options ? (
          <MappingForm
            key={JSON.stringify(batch.options)}
            batchId={batchId}
            headers={batch.headers}
            mapping={batch.options.mapping}
            dateFormat={batch.options.dateFormat}
          />
        ) : null}

        <p className="mb-3">{t.summary(batch.validRows, batch.totalRows)}</p>

        <ul className="nav nav-tabs mb-3">
          {FILTER_TABS.map((tab) => (
            <li className="nav-item" key={tab.value}>
              <button
                type="button"
                className={`nav-link${filter === tab.value ? ' active' : ''}`}
                onClick={() => onFilterChange(tab.value)}
              >
                {tab.label()}
              </button>
            </li>
          ))}
        </ul>

        {rows.length === 0 ? (
          <ErrorState message={t.noRowsSelected} />
        ) : (
          <PreviewTable rows={rows} pendingRowNumbers={pendingRowNumbers} onToggleSelected={handleToggleSelected} onChangeCategory={handleChangeCategory} />
        )}

        {meta && meta.totalPages > 1 ? (
          <nav className="d-flex justify-content-center gap-2 mt-3" aria-label="Preview pagination">
            <button type="button" className="btn btn-outline-secondary btn-sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
              {en.transactions.pagination.previous}
            </button>
            <span className="align-self-center small">{en.transactions.pagination.pageOf(meta.page, meta.totalPages)}</span>
            <button type="button" className="btn btn-outline-secondary btn-sm" disabled={page >= meta.totalPages} onClick={() => onPageChange(page + 1)}>
              {en.transactions.pagination.next}
            </button>
          </nav>
        ) : null}

        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mt-4">
          <div className="d-flex gap-2">
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => updateRows.mutate({ setAllSelected: true })} disabled={updateRows.isPending}>
              {t.selectAllValid}
            </button>
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => updateRows.mutate({ setAllSelected: false })} disabled={updateRows.isPending}>
              {t.deselectAll}
            </button>
            <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => setShowDiscardConfirm(true)}>
              {t.discard}
            </button>
          </div>
          <button type="button" className="btn btn-primary" disabled={batch.selectedRows === 0 || isCommitting} onClick={onCommit}>
            {isCommitting ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
                {t.importing}
              </>
            ) : (
              t.importButton(batch.selectedRows)
            )}
          </button>
        </div>
      </div>

      <ConfirmModal
        show={showDiscardConfirm}
        title={t.discardConfirmTitle}
        body={t.discardConfirmBody}
        variant="danger"
        onCancel={() => setShowDiscardConfirm(false)}
        onConfirm={() => {
          setShowDiscardConfirm(false);
          onDiscard();
        }}
      />
    </div>
  );
}
