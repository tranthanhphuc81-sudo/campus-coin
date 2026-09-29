/**
 * TransactionsPage.tsx
 * Student transactions list (`/app/transactions`): a "Recently viewed" strip, filter bar, desktop
 * table / mobile card list, pagination, possible-duplicate/unusual badges, row click opens the
 * detail/edit drawer, and delete shows an Undo toast for 5s before falling back to the Trash page.
 * A `?open=<id>` query param (set by the dashboard's "Recent" widget and by anomaly/duplicate
 * notifications) opens that transaction's drawer on mount, then is stripped from the URL so a
 * refresh/back-button never reopens it.
 * Exports: default (TransactionsPage)
 * Spec: docs/spec/05a §5.4 (BR-TX-07 soft delete, BR-TX-08 list) · docs/spec/05c §5.14 · docs/spec/08 §8.3
 */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ConfirmModal } from '../../../components/ConfirmModal';
import { EmptyState } from '../../../components/EmptyState';
import { ErrorState } from '../../../components/ErrorState';
import { MoneyText } from '../../../components/MoneyText';
import { PageHeader } from '../../../components/PageHeader';
import { TableSkeleton } from '../../../components/Skeletons';
import { useToast } from '../../../components/ToastProvider';
import { en } from '../../../i18n/en';
import { formatDisplayDate } from '../../../lib/dates';
import { QuickAddModal } from '../components/QuickAddModal';
import { RecentlyViewedSection } from '../components/RecentlyViewedSection';
import { TransactionDetailDrawer } from '../components/TransactionDetailDrawer';
import { TransactionFiltersBar } from '../components/TransactionFiltersBar';
import { useDeleteTransactionMutation, useRestoreTransactionMutation, useTransactionsQuery } from '../hooks';
import { filtersToQuery, useTransactionFilters } from '../useTransactionFilters';

const UNDO_WINDOW_MS = 5000;

/** Student transactions list, filters, pagination, badges and delete/undo. */
export default function TransactionsPage() {
  const { filters, setFilters, clearFilters } = useTransactionFilters();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showQuickAdd, setShowQuickAdd] = useState(false);

  // Runs once on mount only: reads the initial `?open=` (if any) and strips it from the URL, so a
  // later reload/back-navigation never reopens the drawer on its own. Genuine one-time sync from
  // the URL a caller (dashboard widget, notification) navigated in with, not a derived-during-render
  // value, so an effect is the right tool despite the general "avoid setState-in-effect" guidance.
  useEffect(() => {
    const openParam = searchParams.get('open');
    if (!openParam) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpenId(openParam);
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.delete('open');
        return next;
      },
      { replace: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const query = filtersToQuery(filters, false);
  const listQuery = useTransactionsQuery(query);
  const deleteMutation = useDeleteTransactionMutation();
  const restoreMutation = useRestoreTransactionMutation();

  const hasAnyFilter = Boolean(
    filters.from || filters.to || filters.type || filters.categoryId?.length || filters.q || filters.minAmount || filters.maxAmount,
  );

  function handleDelete(id: string) {
    setConfirmDeleteId(null);
    deleteMutation.mutate(id, {
      onSuccess: () => {
        showToast({
          message: en.transactions.deleted,
          actionLabel: en.common.undo,
          onAction: () => restoreMutation.mutate(id),
          durationMs: UNDO_WINDOW_MS,
        });
      },
    });
  }

  const transactions = listQuery.data?.data ?? [];
  const meta = listQuery.data?.meta;

  return (
    <>
      <PageHeader
        title={en.transactions.pageTitle}
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setShowQuickAdd(true)}>
            {en.transactions.addButton}
          </button>
        }
      />

      <RecentlyViewedSection onSelect={setOpenId} />

      <TransactionFiltersBar filters={filters} onChange={setFilters} onClear={clearFilters} />

      {listQuery.isLoading ? (
        <TableSkeleton rows={8} />
      ) : listQuery.isError ? (
        <ErrorState onRetry={() => void listQuery.refetch()} />
      ) : transactions.length === 0 ? (
        hasAnyFilter ? (
          <EmptyState icon="bi-funnel" message={en.transactions.noResults} />
        ) : (
          <EmptyState icon="bi-inbox" message={en.transactions.empty} actionLabel={en.transactions.addButton} onAction={() => setShowQuickAdd(true)} />
        )
      ) : (
        <>
          {/* Desktop table */}
          <div className="table-responsive d-none d-md-block">
            <table className="table align-middle">
              <thead>
                <tr>
                  <th scope="col">{en.transactions.table.date}</th>
                  <th scope="col">{en.transactions.table.description}</th>
                  <th scope="col">{en.transactions.table.category}</th>
                  <th scope="col" className="text-end">
                    {en.transactions.table.amount}
                  </th>
                  <th scope="col" className="text-end">
                    {en.transactions.table.actions}
                  </th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((txn) => (
                  <tr key={txn.id}>
                    <td>{formatDisplayDate(txn.txnDate)}</td>
                    <td>
                      {txn.description ?? <span className="text-body-secondary">{en.transactions.table.noDescription}</span>}
                      {txn.isPossibleDuplicate ? <span className="badge text-bg-warning ms-2">{en.transactions.badges.possibleDuplicate}</span> : null}
                      {txn.isAnomaly ? <span className="badge text-bg-warning ms-2">{en.transactions.badges.unusual}</span> : null}
                    </td>
                    <td>{txn.category.name}</td>
                    <td className="text-end">
                      <MoneyText amount={txn.amount} type={txn.type} currency={txn.currency as 'USD' | 'VND'} />
                    </td>
                    <td className="text-end">
                      <button type="button" className="btn btn-sm btn-outline-secondary me-2" onClick={() => setOpenId(txn.id)}>
                        {en.transactions.table.edit}
                      </button>
                      <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setConfirmDeleteId(txn.id)}>
                        {en.transactions.table.delete}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <div className="d-md-none d-flex flex-column gap-2">
            {transactions.map((txn) => (
              <div key={txn.id} className="card">
                <div className="card-body d-flex justify-content-between align-items-start gap-2">
                  <div>
                    <div className="fw-semibold">
                      {txn.description ?? <span className="text-body-secondary">{en.transactions.table.noDescription}</span>}
                    </div>
                    <small className="text-body-secondary">
                      {formatDisplayDate(txn.txnDate)} · {txn.category.name}
                    </small>
                    <div>
                      {txn.isPossibleDuplicate ? <span className="badge text-bg-warning me-1">{en.transactions.badges.possibleDuplicate}</span> : null}
                      {txn.isAnomaly ? <span className="badge text-bg-warning">{en.transactions.badges.unusual}</span> : null}
                    </div>
                  </div>
                  <div className="text-end">
                    <MoneyText amount={txn.amount} type={txn.type} currency={txn.currency as 'USD' | 'VND'} />
                    <div className="mt-2 d-flex gap-2 justify-content-end">
                      <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setOpenId(txn.id)}>
                        {en.transactions.table.edit}
                      </button>
                      <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setConfirmDeleteId(txn.id)}>
                        {en.transactions.table.delete}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {meta && meta.totalPages > 1 ? (
            <nav className="d-flex justify-content-between align-items-center mt-3" aria-label={en.transactions.pagination.pageOf(meta.page, meta.totalPages)}>
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                disabled={meta.page <= 1}
                onClick={() => setFilters({ page: meta.page - 1 })}
              >
                {en.transactions.pagination.previous}
              </button>
              <span className="small text-body-secondary">{en.transactions.pagination.pageOf(meta.page, meta.totalPages)}</span>
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                disabled={meta.page >= meta.totalPages}
                onClick={() => setFilters({ page: meta.page + 1 })}
              >
                {en.transactions.pagination.next}
              </button>
            </nav>
          ) : null}
        </>
      )}

      <ConfirmModal
        show={confirmDeleteId !== null}
        title={en.transactions.deleteConfirmTitle}
        body={en.transactions.deleteConfirmBody}
        variant="danger"
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={() => confirmDeleteId && handleDelete(confirmDeleteId)}
      />

      <QuickAddModal show={showQuickAdd} onClose={() => setShowQuickAdd(false)} />
      <TransactionDetailDrawer transactionId={openId} onClose={() => setOpenId(null)} />
    </>
  );
}
