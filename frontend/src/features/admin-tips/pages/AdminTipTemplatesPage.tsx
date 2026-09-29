/**
 * AdminTipTemplatesPage.tsx
 * Admin tip-templates page (`/admin/tip-templates`): table (code, rule type, active badge, updated),
 * add/edit modal with preview, and delete with a 409-in-use -> "deactivate instead" inline fallback
 * (a button right in the error alert, not a separate modal — spec §8.3).
 * Exports: default (AdminTipTemplatesPage)
 * Spec: docs/spec/05b §5.10 · docs/spec/05c §5.13
 */
import type { TipTemplateDto } from '@campuscoin/shared';
import { useState } from 'react';
import { ConfirmModal } from '../../../components/ConfirmModal';
import { EmptyState } from '../../../components/EmptyState';
import { ErrorState } from '../../../components/ErrorState';
import { PageHeader } from '../../../components/PageHeader';
import { TableSkeleton } from '../../../components/Skeletons';
import { useToast } from '../../../components/ToastProvider';
import { en } from '../../../i18n/en';
import { formatDateTime } from '../../../lib/dates';
import { TipTemplateFormModal } from '../components/TipTemplateFormModal';
import { useAdminTipTemplatesQuery, useDeleteAdminTipTemplateMutation, useUpdateAdminTipTemplateMutation } from '../hooks';

/** Admin tip-templates page: list, add/edit/preview, delete-or-deactivate. */
export default function AdminTipTemplatesPage() {
  const t = en.adminTipTemplates;
  const { showToast } = useToast();
  const templatesQuery = useAdminTipTemplatesQuery();
  const deleteMutation = useDeleteAdminTipTemplateMutation();
  const updateMutation = useUpdateAdminTipTemplateMutation();
  const [showCreate, setShowCreate] = useState(false);
  const [editTemplate, setEditTemplate] = useState<TipTemplateDto | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<TipTemplateDto | null>(null);
  const [inUseTemplate, setInUseTemplate] = useState<TipTemplateDto | null>(null);

  const templates = templatesQuery.data ?? [];

  function handleConfirmDelete() {
    if (!confirmDelete) return;
    const target = confirmDelete;
    setConfirmDelete(null);
    deleteMutation.mutate(target.id, {
      onSuccess: () => showToast({ message: t.deleteModal.deleted }),
      onError: (err) => {
        if (err.status === 409) setInUseTemplate(target);
      },
    });
  }

  function handleDeactivateInstead() {
    if (!inUseTemplate) return;
    updateMutation.mutate(
      { id: inUseTemplate.id, input: { isActive: false } },
      {
        onSuccess: () => {
          showToast({ message: t.deleteModal.deactivated });
          setInUseTemplate(null);
        },
      },
    );
  }

  return (
    <>
      <PageHeader
        title={en.nav.adminTipTemplates}
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setShowCreate(true)}>
            {t.addButton}
          </button>
        }
      />

      {inUseTemplate ? (
        <div className="alert alert-warning d-flex justify-content-between align-items-center" role="alert">
          <div>
            <p className="fw-semibold mb-1">{t.deleteModal.inUseTitle}</p>
            <p className="mb-0">{t.deleteModal.inUseBody}</p>
          </div>
          <div className="d-flex gap-2">
            <button type="button" className="btn btn-sm btn-warning" onClick={handleDeactivateInstead}>
              {t.deleteModal.deactivateInstead}
            </button>
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setInUseTemplate(null)}>
              {en.common.close}
            </button>
          </div>
        </div>
      ) : null}

      {templatesQuery.isLoading ? (
        <TableSkeleton rows={6} />
      ) : templatesQuery.isError ? (
        <ErrorState message={t.loadError} onRetry={() => void templatesQuery.refetch()} />
      ) : templates.length === 0 ? (
        <EmptyState icon="bi-lightbulb" message={t.empty} actionLabel={t.addButton} onAction={() => setShowCreate(true)} />
      ) : (
        <div className="table-responsive">
          <table className="table align-middle">
            <thead>
              <tr>
                <th scope="col">{t.table.code}</th>
                <th scope="col">{t.table.ruleType}</th>
                <th scope="col">{t.table.status}</th>
                <th scope="col">{t.table.updatedAt}</th>
                <th scope="col" className="text-end">
                  {t.table.actions}
                </th>
              </tr>
            </thead>
            <tbody>
              {templates.map((template) => (
                <tr key={template.id}>
                  <td className="font-monospace">{template.code}</td>
                  <td>{t.ruleTypeLabels[template.ruleType]}</td>
                  <td>
                    <span className={`badge text-bg-${template.isActive ? 'success' : 'secondary'}`}>{template.isActive ? t.active : t.inactive}</span>
                  </td>
                  <td>{formatDateTime(template.updatedAt)}</td>
                  <td className="text-end">
                    <button type="button" className="btn btn-sm btn-outline-secondary me-2" onClick={() => setEditTemplate(template)}>
                      {t.edit}
                    </button>
                    <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setConfirmDelete(template)}>
                      {t.delete}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <TipTemplateFormModal show={showCreate} onClose={() => setShowCreate(false)} />
      <TipTemplateFormModal show={editTemplate !== null} template={editTemplate ?? undefined} onClose={() => setEditTemplate(null)} />

      <ConfirmModal
        show={confirmDelete !== null}
        title={t.deleteModal.title}
        body={t.deleteModal.simpleBody}
        variant="danger"
        confirmLabel={t.deleteModal.confirm}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={handleConfirmDelete}
      />
    </>
  );
}
