/**
 * AdminCategoryFormModal.tsx
 * Create/edit modal for a system default category. Adapted from the student-facing
 * `features/categories/components/CategoryFormModal.tsx`: same name/type/icon/color fields (type
 * immutable once created, BR-CA-01), plus two admin-only fields on edit — `isActive` and
 * `sortOrder` — since `UpdateCategoryInput` (shared with the student PATCH schema) supports them.
 * Exports: AdminCategoryFormModal
 * Spec: docs/spec/05a §5.3 · docs/spec/05c §5.13 · Rules: BR-CA-01, BR-CA-02
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
import { useCreateAdminCategoryMutation, useUpdateAdminCategoryMutation } from '../hooks';

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
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0).max(32767),
});

type FormValues = z.infer<typeof formSchema>;

interface AdminCategoryFormModalProps {
  show: boolean;
  onClose: () => void;
  category?: CategoryDto;
}

/** Create/edit modal for a system default category. */
export function AdminCategoryFormModal({ show, onClose, category }: AdminCategoryFormModalProps) {
  const t = en.adminCategories.form;
  const isEdit = category !== undefined;
  const [serverError, setServerError] = useState<string | null>(null);
  const createMutation = useCreateAdminCategoryMutation();
  const updateMutation = useUpdateAdminCategoryMutation();

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
      isActive: category?.isActive ?? true,
      sortOrder: category?.sortOrder ?? 0,
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
          input: {
            name: values.name,
            icon: values.icon || null,
            color: values.color || null,
            isActive: values.isActive,
            sortOrder: values.sortOrder,
          },
        });
        setServerError(null);
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
          {isEdit ? t.editTitle : t.createTitle}
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
            <label htmlFor="admin-category-name" className="form-label">
              {t.name}
            </label>
            <input
              id="admin-category-name"
              type="text"
              className={`form-control ${errors.name ? 'is-invalid' : ''}`}
              aria-describedby={errors.name ? 'admin-category-name-error' : undefined}
              {...register('name')}
            />
            {errors.name ? (
              <div id="admin-category-name-error" className="invalid-feedback">
                {errors.name.message}
              </div>
            ) : null}
          </div>

          {!isEdit ? (
            <div className="mb-3">
              <label htmlFor="admin-category-type" className="form-label">
                {t.type}
              </label>
              <select id="admin-category-type" className="form-select" {...register('type')}>
                <option value={TransactionType.EXPENSE}>{en.adminCategories.typeExpense}</option>
                <option value={TransactionType.INCOME}>{en.adminCategories.typeIncome}</option>
              </select>
            </div>
          ) : null}

          <div className="row">
            <div className="col-sm-8 mb-3">
              <label htmlFor="admin-category-icon" className="form-label">
                {t.icon}
              </label>
              <div className="input-group">
                <span className="input-group-text">
                  <i className={`bi bi-${icon || 'tag'}`} aria-hidden="true" />
                </span>
                <input
                  id="admin-category-icon"
                  type="text"
                  list="admin-category-icon-suggestions"
                  className={`form-control ${errors.icon ? 'is-invalid' : ''}`}
                  {...register('icon')}
                />
              </div>
              <datalist id="admin-category-icon-suggestions">
                {ICON_SUGGESTIONS.map((suggestion) => (
                  <option key={suggestion} value={suggestion} />
                ))}
              </datalist>
              {errors.icon ? <div className="invalid-feedback d-block">{errors.icon.message}</div> : null}
            </div>
            <div className="col-sm-4 mb-3">
              <label htmlFor="admin-category-color" className="form-label">
                {t.color}
              </label>
              <input id="admin-category-color" type="color" className="form-control form-control-color" {...register('color')} />
            </div>
          </div>

          {isEdit ? (
            <div className="row">
              <div className="col-sm-6 mb-3">
                <label htmlFor="admin-category-sort-order" className="form-label">
                  {t.sortOrder}
                </label>
                <input
                  id="admin-category-sort-order"
                  type="number"
                  min={0}
                  max={32767}
                  className={`form-control ${errors.sortOrder ? 'is-invalid' : ''}`}
                  {...register('sortOrder', { valueAsNumber: true })}
                />
                {errors.sortOrder ? <div className="invalid-feedback">{errors.sortOrder.message}</div> : null}
              </div>
              <div className="col-sm-6 mb-3 d-flex align-items-end">
                <div className="form-check">
                  <input id="admin-category-is-active" type="checkbox" className="form-check-input" {...register('isActive')} />
                  <label htmlFor="admin-category-is-active" className="form-check-label">
                    {t.isActive}
                  </label>
                </div>
              </div>
            </div>
          ) : null}

          <div className="d-flex gap-2 justify-content-end">
            <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
              {en.common.cancel}
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Spinner animation="border" size="sm" className="me-2" aria-hidden="true" />
                  {isEdit ? t.saving : t.creating}
                </>
              ) : isEdit ? (
                t.save
              ) : (
                t.create
              )}
            </button>
          </div>
        </form>
      </Modal.Body>
    </Modal>
  );
}
