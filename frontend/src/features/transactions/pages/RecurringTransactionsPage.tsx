/**
 * RecurringTransactionsPage.tsx
 * Recurring rules list (`/app/transactions/recurring`): pause/resume (`PATCH {isActive}` — there
 * is no dedicated pause/resume endpoint), edit (future occurrences only) and delete (previously
 * generated transactions are kept). Creating one opens the same form modal used for editing.
 * Exports: default (RecurringTransactionsPage)
 * Spec: docs/spec/05a §5.4.2 (recurring transactions)
 */
import { useState } from 'react';
import { ConfirmModal } from '../../../components/ConfirmModal';
import { EmptyState } from '../../../components/EmptyState';
import { ErrorState } from '../../../components/ErrorState';
import { MoneyText } from '../../../components/MoneyText';
import { PageHeader } from '../../../components/PageHeader';
import { TableSkeleton } from '../../../components/Skeletons';
import { useToast } from '../../../components/ToastProvider';
import { en } from '../../../i18n/en';
import { useAuth } from '../../../lib/auth/AuthContext';
import { formatDisplayDate } from '../../../lib/dates';
import { RecurringRuleFormModal } from '../components/RecurringRuleFormModal';
import { useDeleteRecurringRuleMutation, useRecurringRulesQuery, useUpdateRecurringRuleMutation } from '../hooks';

/** Recurring rules: list, pause/resume, edit (future occurrences), delete. */
export default function RecurringTransactionsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const rulesQuery = useRecurringRulesQuery();
  const updateMutation = useUpdateRecurringRuleMutation();
  const deleteMutation = useDeleteRecurringRuleMutation();
  const [editRuleId, setEditRuleId] = useState<number | 'new' | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const rules = rulesQuery.data ?? [];
  const editingRule = editRuleId !== null && editRuleId !== 'new' ? rules.find((r) => r.id === editRuleId) : undefined;

  function handleToggleActive(id: number, nextActive: boolean) {
    updateMutation.mutate(
      { id, input: { isActive: nextActive } },
      {
        onSuccess: () =>
          showToast({ message: nextActive ? en.transactions.recurring.resumeSuccess : en.transactions.recurring.pauseSuccess }),
      },
    );
  }

  function handleDelete(id: number) {
    setConfirmDeleteId(null);
    deleteMutation.mutate(id, { onSuccess: () => showToast({ message: en.transactions.recurring.deleteSuccess }) });
  }

  return (
    <>
      <PageHeader
        title={en.transactions.recurring.pageTitle}
        subtitle={en.transactions.recurring.subtitle}
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setEditRuleId('new')}>
            {en.transactions.recurring.addButton}
          </button>
        }
      />

      {rulesQuery.isLoading ? (
        <TableSkeleton rows={4} />
      ) : rulesQuery.isError ? (
        <ErrorState onRetry={() => void rulesQuery.refetch()} />
      ) : rules.length === 0 ? (
        <EmptyState icon="bi-arrow-repeat" message={en.transactions.recurring.empty} actionLabel={en.transactions.recurring.addButton} onAction={() => setEditRuleId('new')} />
      ) : (
        <div className="d-flex flex-column gap-2">
          {rules.map((rule) => (
            <div key={rule.id} className="card">
              <div className="card-body d-flex justify-content-between align-items-start gap-2 flex-wrap">
                <div>
                  <div className="fw-semibold">
                    {rule.category.name}
                    <span className={`badge ms-2 ${rule.isActive ? 'text-bg-success' : 'text-bg-secondary'}`}>
                      {rule.isActive ? en.transactions.recurring.active : en.transactions.recurring.paused}
                    </span>
                  </div>
                  <MoneyText amount={rule.amount} type={rule.type} currency={user?.currency} />
                  <div className="small text-body-secondary">
                    {rule.description ?? en.transactions.table.noDescription}
                  </div>
                  <div className="small text-body-secondary">
                    {rule.nextRunDate ? en.transactions.recurring.nextRun(formatDisplayDate(rule.nextRunDate)) : en.transactions.recurring.noNextRun}
                  </div>
                </div>
                <div className="d-flex gap-2">
                  <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => handleToggleActive(rule.id, !rule.isActive)}>
                    {rule.isActive ? en.transactions.recurring.pause : en.transactions.recurring.resume}
                  </button>
                  <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setEditRuleId(rule.id)}>
                    {en.transactions.recurring.edit}
                  </button>
                  <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setConfirmDeleteId(rule.id)}>
                    {en.transactions.recurring.delete}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <RecurringRuleFormModal show={editRuleId !== null} rule={editingRule} onClose={() => setEditRuleId(null)} />

      <ConfirmModal
        show={confirmDeleteId !== null}
        title={en.transactions.recurring.deleteConfirmTitle}
        body={en.transactions.recurring.deleteConfirmBody}
        variant="danger"
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={() => confirmDeleteId !== null && handleDelete(confirmDeleteId)}
      />
    </>
  );
}
