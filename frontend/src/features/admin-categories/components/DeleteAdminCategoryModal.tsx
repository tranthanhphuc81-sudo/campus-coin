/**
 * DeleteAdminCategoryModal.tsx
 * Delete flow for a system default category. Tries a plain delete first; a `409 conflict` (still in
 * use by transactions across student accounts) switches the modal to an "archive instead?" prompt.
 * Adapted from the student-facing `DeleteCategoryModal` with the `reassignTo` option removed — the
 * admin delete endpoint only ever supports `archive` or a plain (hard) delete.
 * Exports: DeleteAdminCategoryModal
 * Spec: docs/spec/05a §5.3 (BR-CA-03, admin variant) · docs/spec/05c §5.13
 */
import type { CategoryDto } from '@campuscoin/shared';
import { useState } from 'react';
import Modal from 'react-bootstrap/Modal';
import Button from 'react-bootstrap/Button';
import { en } from '../../../i18n/en';
import { useToast } from '../../../components/ToastProvider';
import { useDeleteAdminCategoryMutation } from '../hooks';

interface DeleteAdminCategoryModalProps {
  category: CategoryDto | null;
  onClose: () => void;
}

type Mode = 'confirm' | 'inUse';

/** Delete/archive flow for a default category, opened from its Delete button. */
export function DeleteAdminCategoryModal({ category, onClose }: DeleteAdminCategoryModalProps) {
  const t = en.adminCategories.deleteModal;
  const [mode, setMode] = useState<Mode>('confirm');
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();
  const deleteMutation = useDeleteAdminCategoryMutation();

  function handleClose() {
    setMode('confirm');
    setError(null);
    onClose();
  }

  function handleConfirmDelete() {
    if (!category) return;
    setError(null);
    deleteMutation.mutate(
      { id: category.id },
      {
        onSuccess: () => {
          showToast({ message: t.deleted });
          handleClose();
        },
        onError: (err) => {
          if (err.status === 409) setMode('inUse');
          else setError(err.detail ?? err.title ?? en.errors.generic);
        },
      },
    );
  }

  function handleArchive() {
    if (!category) return;
    setError(null);
    deleteMutation.mutate(
      { id: category.id, archive: true },
      {
        onSuccess: () => {
          showToast({ message: t.archived });
          handleClose();
        },
        onError: (err) => setError(err.detail ?? en.errors.generic),
      },
    );
  }

  return (
    <Modal show={category !== null} onHide={handleClose} centered>
      <Modal.Header closeButton>
        <Modal.Title as="h2" className="h5 mb-0">
          {t.title}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error ? (
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
        ) : null}
        {mode === 'confirm' ? (
          <p>{t.simpleBody}</p>
        ) : (
          <>
            <p className="fw-semibold">{t.inUseTitle}</p>
            <p>{t.inUseBody}</p>
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={handleClose}>
          {en.common.cancel}
        </Button>
        {mode === 'confirm' ? (
          <Button variant="danger" onClick={handleConfirmDelete}>
            {t.confirm}
          </Button>
        ) : (
          <Button variant="danger" onClick={handleArchive}>
            {t.archiveConfirm}
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
}
