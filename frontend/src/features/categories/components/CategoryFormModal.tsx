/**
 * CategoryFormModal.tsx
 * Create/edit modal for a personal category. `type` is immutable once created (BR-CA-01), so it
 * only appears on create. The icon field is a free-text Bootstrap Icons key (`bi-<key>`, e.g.
 * "cup-hot") with a live preview and a `<datalist>` of common suggestions — a lightweight stand-in
 * for a full icon-grid picker, since no icon-picker library is in the locked stack.
 * Exports: CategoryFormModal
 * Spec: docs/spec/05a §5.3 (categories) · Rules: BR-CA-01, BR-CA-02, BR-CA-04
 */
import { categoryNameSchema, TransactionType, type CategoryDto } from '@campuscoin/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import Modal from 'react-bootstrap/Modal';
import Spinner from 'react-bootstrap/Spinner';
import { z } from 'zod';
import { en } from '../../../i18n/en';
import { applyFieldErrors, type ApiError } from '../../../lib/apiClient/apiError';
import { useCreateCategoryMutation, useUpdateCategoryMutation } from '../hooks';

const ICON_SUGGESTIONS = [
  'cup-hot', 'bus-front', 'house-door', 'cart', 'wallet2', 'piggy-bank', 'gift', 'mortarboard',
  'controller', 'film', 'phone', 'wifi', 'heart-pulse', 'airplane', 'bag', 'book', 'bicycle',
  'fuel-pump', 'cash-coin', 'credit-card', 'three-dots',
];

const formSchema = z.object({
  name: categoryNameSchema,
  type: z.enum(TransactionType),
  icon: z
    .string()
    .regex(/^[a-z0-9-]{0,40}$/, 'Lowercase letters, digits and hyphens only.')
    .optional(),
  color: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface CategoryFormModalProps {
  show: boolean;
  onClose: () => void;
  category?: CategoryDto;
}

/** Create/edit modal for a personal category (name, type on create only, icon, colour). */
export function CategoryFormModal({ show, onClose, category }: CategoryFormModalProps) {
  const isEdit = category !== undefined;
  const [serverError, setServerError] = useState<string | null>(null);
  const createMutation = useCreateCategoryMutation();
  const updateMutation = useUpdateCategoryMutation();

  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    values: {
      name: category?.name ?? '',
      type: category?.type ?? TransactionType.EXPENSE,
      icon: category?.icon ?? '',
      color: category?.color ?? '#1F4E79',
    },
  });

  // `useWatch` (not `watch`) so this component stays compiler-memoizable.
  const icon = useWatch({ control, name: 'icon' });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      if (isEdit) {
        await updateMutation.mutateAsync({
          id: category.id,
          input: { name: values.name, icon: values.icon || null, color: values.color || null },
        });
      } else {
        await createMutation.mutateAsync({ name: values.name, type: values.type, icon: values.icon || undefined, color: values.color || undefined });
      }
      reset();
      onClose();
    } catch (err) {
      const error = err as ApiError;
      applyFieldErrors(setError, error);
      if (Object.keys(error.fieldErrors).length === 0) setServerError(error.detail ?? error.title ?? en.errors.generic);
    }
  }

  return (
    <Modal show={show} onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title as="h2" className="h5 mb-0">
          {isEdit ? en.categories.form.editTitle : en.categories.form.createTitle}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {serverError ? (
          <div className="alert alert-danger" role="alert">
            {serverError}
          </div>
        ) : null}
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="mb-3">
            <label htmlFor="category-name" className="form-label">
              {en.categories.form.name}
            </label>
            <input
              id="category-name"
              type="text"
              className={`form-control ${errors.name ? 'is-invalid' : ''}`}
              {...register('name')}
            />
            {errors.name ? <div className="invalid-feedback">{errors.name.message}</div> : null}
          </div>

          {!isEdit ? (
            <div className="mb-3">
              <label htmlFor="category-type" className="form-label">
                {en.categories.form.type}
              </label>
              <select id="category-type" className="form-select" {...register('type')}>
                <option value={TransactionType.EXPENSE}>{en.categories.form.typeExpense}</option>
                <option value={TransactionType.INCOME}>{en.categories.form.typeIncome}</option>
              </select>
            </div>
          ) : null}

          <div className="row">
            <div className="col-sm-8 mb-3">
              <label htmlFor="category-icon" className="form-label">
                {en.categories.form.icon}
              </label>
              <div className="input-group">
                <span className="input-group-text">
                  <i className={`bi bi-${icon || 'tag'}`} aria-hidden="true" />
                </span>
                <input
                  id="category-icon"
                  type="text"
                  list="category-icon-suggestions"
                  className={`form-control ${errors.icon ? 'is-invalid' : ''}`}
                  {...register('icon')}
                />
              </div>
              <datalist id="category-icon-suggestions">
                {ICON_SUGGESTIONS.map((suggestion) => (
                  <option key={suggestion} value={suggestion} />
                ))}
              </datalist>
              {errors.icon ? <div className="invalid-feedback d-block">{errors.icon.message}</div> : null}
            </div>
            <div className="col-sm-4 mb-3">
              <label htmlFor="category-color" className="form-label">
                {en.categories.form.color}
              </label>
              <input id="category-color" type="color" className="form-control form-control-color" {...register('color')} />
            </div>
          </div>

          <div className="d-flex gap-2 justify-content-end">
            <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
              {en.common.cancel}
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Spinner animation="border" size="sm" className="me-2" aria-hidden="true" />
                  {isEdit ? en.categories.form.saving : en.categories.form.creating}
                </>
              ) : isEdit ? (
                en.categories.form.save
              ) : (
                en.categories.form.create
              )}
            </button>
          </div>
        </form>
      </Modal.Body>
    </Modal>
  );
}
