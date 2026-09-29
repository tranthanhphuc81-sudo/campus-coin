/**
 * TransactionDetailDrawer.tsx
 * Right-side drawer opened from a transaction row: "Details" tab (edit form, BR-TX-05 optimistic
 * locking) and "History" tab (BR-TX-06 append-only change timeline). A 409 version-mismatch on
 * save shows a dedicated "changed elsewhere — reload?" banner instead of a generic form error. An
 * active anomaly/possible-duplicate flag renders `TransactionFlagBanner` (P14) above the tabs,
 * with interactive Keep/Delete actions — the transactions LIST's own display-only badges (P08)
 * are unrelated and unchanged.
 * Exports: TransactionDetailDrawer
 * Spec: docs/spec/05a §5.4.3 (transaction lifecycle) · docs/spec/05c §5.14 · Rules: BR-TX-05, BR-TX-06
 */
import { useState } from 'react';
import Offcanvas from 'react-bootstrap/Offcanvas';
import { useToast } from '../../../components/ToastProvider';
import { EmptyState } from '../../../components/EmptyState';
import { ErrorState } from '../../../components/ErrorState';
import { TableSkeleton } from '../../../components/Skeletons';
import { en } from '../../../i18n/en';
import { formatDateTime } from '../../../lib/dates';
import type { ApiError } from '../../../lib/apiClient/apiError';
import { useTransactionHistoryQuery, useTransactionQuery, useUpdateTransactionMutation } from '../hooks';
import { TransactionFlagBanner } from './TransactionFlagBanner';
import { TransactionForm, type TransactionFormValues } from './TransactionForm';

interface TransactionDetailDrawerProps {
  transactionId: string | null;
  onClose: () => void;
}

type Tab = 'details' | 'history';

/** Details/History drawer for a single transaction, opened by clicking a row in the list. */
export function TransactionDetailDrawer({ transactionId, onClose }: TransactionDetailDrawerProps) {
  const [tab, setTab] = useState<Tab>('details');
  const [conflict, setConflict] = useState(false);
  const { showToast } = useToast();
  const transactionQuery = useTransactionQuery(transactionId);
  const updateMutation = useUpdateTransactionMutation();

  function handleClose() {
    setTab('details');
    setConflict(false);
    onClose();
  }

  async function handleSubmit(values: TransactionFormValues) {
    if (!transactionQuery.data) return;
    await updateMutation.mutateAsync({
      id: transactionQuery.data.id,
      input: {
        type: values.type,
        amount: values.amount,
        txnDate: values.txnDate,
        description: values.description,
        categoryId: values.categoryId,
        version: transactionQuery.data.version,
        // Only present when `TransactionForm` ran a fresh suggestion session this edit (i.e. the
        // description was changed) — otherwise omitted so the server keeps the transaction's
        // stored AI provenance untouched (see `TransactionForm`'s `suggestSessionActive`).
        ...(values.aiSuggestedCategoryId !== undefined ? { aiSuggestedCategoryId: values.aiSuggestedCategoryId } : {}),
        ...(values.aiConfidence !== undefined ? { aiConfidence: values.aiConfidence } : {}),
      },
    });
    showToast({ message: en.transactions.saved });
    handleClose();
  }

  function handleFormError(error: ApiError) {
    if (error.status === 409) setConflict(true);
  }

  async function handleReload() {
    setConflict(false);
    await transactionQuery.refetch();
  }

  return (
    <Offcanvas show={transactionId !== null} onHide={handleClose} placement="end">
      <Offcanvas.Header closeButton>
        <Offcanvas.Title as="h2" className="h5 mb-0">
          {en.transactions.editTitle}
        </Offcanvas.Title>
      </Offcanvas.Header>
      <Offcanvas.Body>
        {transactionQuery.isLoading ? (
          <TableSkeleton rows={4} />
        ) : transactionQuery.isError ? (
          <ErrorState onRetry={() => void transactionQuery.refetch()} />
        ) : transactionQuery.data ? (
          <>
            <TransactionFlagBanner transaction={transactionQuery.data} onDeleted={handleClose} />

            <ul className="nav nav-tabs mb-3">
              <li className="nav-item">
                <button type="button" className={`nav-link${tab === 'details' ? ' active' : ''}`} onClick={() => setTab('details')}>
                  {en.transactions.tabs.details}
                </button>
              </li>
              <li className="nav-item">
                <button type="button" className={`nav-link${tab === 'history' ? ' active' : ''}`} onClick={() => setTab('history')}>
                  {en.transactions.tabs.history}
                </button>
              </li>
            </ul>

            {tab === 'details' ? (
              <>
                {conflict ? (
                  <div className="alert alert-warning" role="alert">
                    <p className="fw-semibold mb-1">{en.transactions.versionConflictTitle}</p>
                    <p className="mb-2">{en.transactions.versionConflictBody}</p>
                    <button type="button" className="btn btn-sm btn-warning" onClick={() => void handleReload()}>
                      {en.transactions.reload}
                    </button>
                  </div>
                ) : null}
                <TransactionForm
                  key={transactionQuery.data.version}
                  mode="edit"
                  formId="edit-transaction"
                  defaultValues={{
                    type: transactionQuery.data.type,
                    amount: transactionQuery.data.amount,
                    txnDate: transactionQuery.data.txnDate,
                    description: transactionQuery.data.description,
                    categoryId: transactionQuery.data.categoryId,
                  }}
                  onSubmit={handleSubmit}
                  onError={handleFormError}
                  onCancel={handleClose}
                  submitLabel={en.transactions.save}
                  submittingLabel={en.transactions.saving}
                />
              </>
            ) : (
              <TransactionHistoryTab transactionId={transactionQuery.data.id} />
            )}
          </>
        ) : null}
      </Offcanvas.Body>
    </Offcanvas>
  );
}

function TransactionHistoryTab({ transactionId }: { transactionId: string }) {
  const historyQuery = useTransactionHistoryQuery(transactionId);

  if (historyQuery.isLoading) return <TableSkeleton rows={3} />;
  if (historyQuery.isError) return <ErrorState onRetry={() => void historyQuery.refetch()} />;
  const entries = historyQuery.data ?? [];
  if (entries.length === 0) return <EmptyState icon="bi-clock-history" message={en.transactions.history.empty} />;

  return (
    <ol className="list-unstyled">
      {entries.map((entry) => (
        <li key={entry.id} className="border-bottom py-2">
          <div className="fw-semibold">
            {en.transactions.history.action[entry.action as keyof typeof en.transactions.history.action] ?? entry.action}
          </div>
          <small className="text-body-secondary">{en.transactions.history.by(formatDateTime(entry.changedAt))}</small>
        </li>
      ))}
    </ol>
  );
}

