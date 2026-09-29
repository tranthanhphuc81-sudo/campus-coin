/**
 * PreviewTable.tsx
 * Editable preview table for the Map & preview step: per-row select checkbox (disabled on error
 * rows), category picker, "Duplicate"/"Needs review" badges, and error rows shown in red with
 * their reasons listed as plain text (never HTML from user/AI input, per CLAUDE.md).
 * Exports: PreviewTable
 * Spec: docs/spec/05a §5.5
 */
import type { ImportPreviewRowDto } from '@campuscoin/shared';
import { MoneyText } from '../../../components/MoneyText';
import { en } from '../../../i18n/en';
import { formatDisplayDate } from '../../../lib/dates';
import { CategoryPicker } from '../../transactions/components/CategoryPicker';

interface PreviewTableProps {
  rows: ImportPreviewRowDto[];
  pendingRowNumbers: ReadonlySet<number>;
  onToggleSelected: (rowNumber: number, selected: boolean) => void;
  onChangeCategory: (rowNumber: number, categoryId: number) => void;
}

/** One row's status cell: error reasons (if any), plus duplicate/needs-review badges. */
function RowStatus({ row }: { row: ImportPreviewRowDto }) {
  const t = en.transactions.import.preview;
  return (
    <div className="d-flex flex-column gap-1">
      {row.errors.map((error, index) => (
        <span key={index} className="text-bc-expense small">
          {error.message}
        </span>
      ))}
      <div className="d-flex gap-1">
        {row.isDuplicate ? <span className="badge text-bg-warning">{t.badgeDuplicate}</span> : null}
        {row.needsReview ? <span className="badge text-bg-info">{t.badgeNeedsReview}</span> : null}
      </div>
    </div>
  );
}

/** Editable table of parsed CSV rows for the current preview page. */
export function PreviewTable({ rows, pendingRowNumbers, onToggleSelected, onChangeCategory }: PreviewTableProps) {
  const t = en.transactions.import.preview.table;

  return (
    <div className="table-responsive">
      <table className="table align-middle">
        <thead>
          <tr>
            <th scope="col">
              <span className="visually-hidden">{t.select}</span>
            </th>
            <th scope="col">{t.date}</th>
            <th scope="col">{t.amount}</th>
            <th scope="col">{t.type}</th>
            <th scope="col">{t.description}</th>
            <th scope="col">{t.category}</th>
            <th scope="col">{t.status}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const hasError = row.errors.length > 0;
            const isPending = pendingRowNumbers.has(row.rowNumber);
            return (
              <tr key={row.rowNumber} className={hasError ? 'table-danger' : undefined}>
                <td>
                  <input
                    type="checkbox"
                    className="form-check-input"
                    checked={row.selected}
                    disabled={hasError || isPending}
                    aria-label={`${t.select} row ${row.rowNumber}`}
                    onChange={(e) => onToggleSelected(row.rowNumber, e.target.checked)}
                  />
                </td>
                <td>{row.txnDate ? formatDisplayDate(row.txnDate) : row.raw.date}</td>
                <td>{row.amount ? <MoneyText amount={row.amount} type={row.type ?? undefined} /> : row.raw.amount}</td>
                <td className="text-capitalize">{row.type ?? row.raw.type}</td>
                <td>{row.description ?? row.raw.description}</td>
                <td style={{ minWidth: '10rem' }}>
                  {row.type ? (
                    <CategoryPicker
                      id={`import-row-${row.rowNumber}-category`}
                      type={row.type}
                      value={row.categoryId}
                      disabled={isPending}
                      onChange={(categoryId) => onChangeCategory(row.rowNumber, categoryId)}
                    />
                  ) : (
                    <span className="text-body-secondary">—</span>
                  )}
                </td>
                <td>
                  <RowStatus row={row} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
