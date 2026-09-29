/**
 * TrashPage.tsx
 * Soft-deleted transactions (`/app/transactions/trash`), kept for 30 days before a background job
 * permanently removes them (BR-TX-07). Simple date-sorted list + a Restore button per row — no
 * filter bar (the Trash is meant to be small and short-lived, unlike the main list).
 * Exports: default (TrashPage)
 * Spec: docs/spec/05a §5.4 (BR-TX-07 soft delete/restore)
 */
import { useState } from 'react';
import { EmptyState } from '../../../components/EmptyState';
import { ErrorState } from '../../../components/ErrorState';
import { MoneyText } from '../../../components/MoneyText';
import { PageHeader } from '../../../components/PageHeader';
import { TableSkeleton } from '../../../components/Skeletons';
import { useToast } from '../../../components/ToastProvider';
import { en } from '../../../i18n/en';
import { formatDateTime, formatDisplayDate } from '../../../lib/dates';
import { useRestoreTransactionMutation, useTransactionsQuery } from '../hooks';

const PAGE_SIZE = 20;

/** Deleted transactions the user can still restore within the 30-day retention window. */
export default function TrashPage() {
  const [page, setPage] = useState(1);
  const { showToast } = useToast();
  const listQuery = useTransactionsQuery({ sort: '-txnDate', page, limit: PAGE_SIZE, deleted: true });
  const restoreMutation = useRestoreTransactionMutation();

  function handleRestore(id: string) {
    restoreMutation.mutate(id, {
      onSuccess: () => showToast({ message: en.transactions.restored }),
    });
  }

  const transactions = listQuery.data?.data ?? [];
  const meta = listQuery.data?.meta;

  return (
    <>
      <PageHeader title={en.transactions.trash.pageTitle} subtitle={en.transactions.trash.subtitle} />

      {listQuery.isLoading ? (
        <TableSkeleton rows={5} />
      ) : listQuery.isError ? (
        <ErrorState onRetry={() => void listQuery.refetch()} />
      ) : transactions.length === 0 ? (
        <EmptyState icon="bi-trash" message={en.transactions.trash.empty} />
      ) : (
        <>
          <ul className="list-unstyled">
            {transactions.map((txn) => (
              <li key={txn.id} className="card mb-2">
                <div className="card-body d-flex justify-content-between align-items-center gap-2">
                  <div>
                    <div className="fw-semibold">
                      {txn.description ?? <span className="text-body-secondary">{en.transactions.table.noDescription}</span>}
                    </div>
                    <small className="text-body-secondary">
                      {formatDisplayDate(txn.txnDate)} · {txn.category.name}
                    </small>
                    {txn.deletedAt ? (
                      <div className="small text-body-secondary">{en.transactions.trash.deletedOn(formatDateTime(txn.deletedAt))}</div>
                    ) : null}
                  </div>
                  <div className="text-end">
                    <MoneyText amount={txn.amount} type={txn.type} currency={txn.currency as 'USD' | 'VND'} />
                    <div className="mt-2">
                      <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => handleRestore(txn.id)}>
                        {en.transactions.trash.restore}
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {meta && meta.totalPages > 1 ? (
            <nav className="d-flex justify-content-between align-items-center mt-3" aria-label={en.transactions.pagination.pageOf(meta.page, meta.totalPages)}>
              <button type="button" className="btn btn-outline-secondary btn-sm" disabled={meta.page <= 1} onClick={() => setPage((p) => p - 1)}>
                {en.transactions.pagination.previous}
              </button>
              <span className="small text-body-secondary">{en.transactions.pagination.pageOf(meta.page, meta.totalPages)}</span>
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                disabled={meta.page >= meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                {en.transactions.pagination.next}
              </button>
            </nav>
          ) : null}
        </>
      )}
    </>
  );
}
