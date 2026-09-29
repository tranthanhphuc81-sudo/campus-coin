/**
 * DeleteCategoryModal.tsx
 * Delete flow for a personal category (BR-CA-03). Tries a plain delete first; if the server
 * reports the category is still in use (`409 conflict`), the modal switches to asking the user to
 * either move its transactions to another category or archive it instead — mutually exclusive,
 * matching `DELETE /categories/:id`'s `reassignTo`/`archive` query params.
 * Exports: DeleteCategoryModal
 * Spec: docs/spec/05a §5.3 (BR-CA-03)
 */
import type { CategoryDto } from '@campuscoin/shared';
import { useState } from 'react';
import Modal from 'react-bootstrap/Modal';
import Button from 'react-bootstrap/Button';
import { en } from '../../../i18n/en';
import { useToast } from '../../../components/ToastProvider';
import { useCategoriesQuery, useDeleteCategoryMutation } from '../hooks';

interface DeleteCategoryModalProps {
  category: CategoryDto | null;
  onClose: () => void;
}

type Mode = 'confirm' | 'inUse';
type Choice = 'reassign' | 'archive';

/** Delete/archive/reassign flow for a personal category, opened from the category's Delete button. */
export function DeleteCategoryModal({ category, onClose }: DeleteCategoryModalProps) {
  const [mode, setMode] = useState<Mode>('confirm');
  const [choice, setChoice] = useState<Choice>('reassign');
  const [reassignTo, setReassignTo] = useState<number | ''>('');
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();
  const deleteMutation = useDeleteCategoryMutation();
  const otherCategoriesQuery = useCategoriesQuery({ type: category?.type });
  const otherCategories = (otherCategoriesQuery.data ?? []).filter((c) => c.id !== category?.id);

  function handleClose() {
    setMode('confirm');
    setChoice('reassign');
    setReassignTo('');
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
          showToast({ message: en.categories.deleteModal.deleted });
          handleClose();
        },
        onError: (err) => {
          if (err.status === 409) setMode('inUse');
          else setError(err.detail ?? err.title ?? en.errors.generic);
        },
      },
    );
  }

  function handleResolve() {
    if (!category) return;
    setError(null);
    const query = choice === 'archive' ? { archive: true } : { reassignTo: Number(reassignTo) };
    deleteMutation.mutate(
      { id: category.id, query },
      {
        onSuccess: () => {
          showToast({ message: choice === 'archive' ? en.categories.deleteModal.archived : en.categories.deleteModal.deleted });
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
          {en.categories.deleteModal.title}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error ? (
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
        ) : null}
        {mode === 'confirm' ? (
          <p>{en.categories.deleteModal.simpleBody}</p>
        ) : (
          <>
            <p className="fw-semibold">{en.categories.deleteModal.inUseTitle}</p>
            <p>{en.categories.deleteModal.inUseBody}</p>
            <div className="form-check mb-2">
              <input
                type="radio"
                id="delete-choice-reassign"
                className="form-check-input"
                checked={choice === 'reassign'}
                onChange={() => setChoice('reassign')}
              />
              <label htmlFor="delete-choice-reassign" className="form-check-label">
                {en.categories.deleteModal.reassignOption}
              </label>
            </div>
            {choice === 'reassign' ? (
              <select
                className="form-select mb-3"
                aria-label={en.categories.deleteModal.reassignLabel}
                value={reassignTo}
                onChange={(e) => setReassignTo(Number(e.target.value))}
              >
                <option value="">{en.transactions.form.categoryPlaceholder}</option>
                {otherCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            ) : null}
            <div className="form-check">
              <input
                type="radio"
                id="delete-choice-archive"
                className="form-check-input"
                checked={choice === 'archive'}
                onChange={() => setChoice('archive')}
              />
              <label htmlFor="delete-choice-archive" className="form-check-label">
                {en.categories.deleteModal.archiveOption}
              </label>
            </div>
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={handleClose}>
          {en.common.cancel}
        </Button>
        {mode === 'confirm' ? (
          <Button variant="danger" onClick={handleConfirmDelete}>
            {en.categories.deleteModal.confirm}
          </Button>
        ) : (
          <Button
            variant="danger"
            disabled={choice === 'reassign' && reassignTo === ''}
            onClick={handleResolve}
          >
            {choice === 'archive' ? en.categories.deleteModal.archiveConfirm : en.categories.deleteModal.confirm}
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
}
