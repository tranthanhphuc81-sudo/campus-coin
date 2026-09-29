/**
 * AnnouncementFormModal.tsx
 * Create/edit modal for a system announcement: title/body/level, `startsAt`/`endsAt` as
 * `datetime-local` inputs (converted to/from ISO strings at the form boundary), and an `isActive`
 * checkbox shown on edit only (a brand-new announcement is always created active).
 * Exports: AnnouncementFormModal
 * Spec: docs/spec/05c §5.13 · docs/spec/07 §7.3.3, §7.3.4
 */
import { ANNOUNCEMENT_BODY_MAX_LENGTH, ANNOUNCEMENT_TITLE_MAX_LENGTH, AnnouncementLevel, noHtmlSchema, type AdminAnnouncementDto } from '@campuscoin/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import Modal from 'react-bootstrap/Modal';
import Spinner from 'react-bootstrap/Spinner';
import { z } from 'zod';
import { en } from '../../../i18n/en';
import { applyFieldErrors, type ApiError } from '../../../lib/apiClient/apiError';
import { useCreateAdminAnnouncementMutation, useUpdateAdminAnnouncementMutation } from '../hooks';

/** Formats an ISO timestamp as a `datetime-local` input value (`YYYY-MM-DDTHH:mm`), in the browser's local time. */
function isoToDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Parses a `datetime-local` input value (local time) into an ISO-8601 UTC string. */
function datetimeLocalToIso(value: string): string {
  return new Date(value).toISOString();
}

const formSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required.').max(ANNOUNCEMENT_TITLE_MAX_LENGTH).pipe(noHtmlSchema),
    body: z.string().trim().min(1, 'Body is required.').max(ANNOUNCEMENT_BODY_MAX_LENGTH).pipe(noHtmlSchema),
    level: z.enum(AnnouncementLevel),
    startsAtLocal: z.string().min(1, 'Start date is required.'),
    endsAtLocal: z.string(),
    isActive: z.boolean(),
  })
  .refine((v) => v.endsAtLocal === '' || v.endsAtLocal > v.startsAtLocal, {
    message: en.adminAnnouncements.form.endBeforeStart,
    path: ['endsAtLocal'],
  });

type FormValues = z.infer<typeof formSchema>;

interface AnnouncementFormModalProps {
  show: boolean;
  onClose: () => void;
  announcement?: AdminAnnouncementDto;
}

/** Create/edit modal for a system announcement. */
export function AnnouncementFormModal({ show, onClose, announcement }: AnnouncementFormModalProps) {
  const t = en.adminAnnouncements.form;
  const isEdit = announcement !== undefined;
  const [serverError, setServerError] = useState<string | null>(null);
  const createMutation = useCreateAdminAnnouncementMutation();
  const updateMutation = useUpdateAdminAnnouncementMutation();

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    values: {
      title: announcement?.title ?? '',
      body: announcement?.body ?? '',
      level: announcement?.level ?? AnnouncementLevel.INFO,
      startsAtLocal: announcement ? isoToDatetimeLocal(announcement.startsAt) : '',
      endsAtLocal: announcement?.endsAt ? isoToDatetimeLocal(announcement.endsAt) : '',
      isActive: announcement?.isActive ?? true,
    },
  });

  function handleClose() {
    setServerError(null);
    reset();
    onClose();
  }

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      const startsAt = datetimeLocalToIso(values.startsAtLocal);
      const endsAt = values.endsAtLocal ? datetimeLocalToIso(values.endsAtLocal) : null;
      if (isEdit) {
        await updateMutation.mutateAsync({
          id: announcement.id,
          input: { title: values.title, body: values.body, level: values.level, startsAt, endsAt, isActive: values.isActive },
        });
      } else {
        await createMutation.mutateAsync({ title: values.title, body: values.body, level: values.level, startsAt, endsAt });
      }
      handleClose();
    } catch (err) {
      const error = err as ApiError;
      applyFieldErrors(setError, error);
      if (Object.keys(error.fieldErrors).length === 0) setServerError(error.detail ?? error.title ?? en.errors.generic);
    }
  }

  return (
    <Modal show={show} onHide={handleClose} centered>
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
            <label htmlFor="announcement-title" className="form-label">
              {t.title}
            </label>
            <input id="announcement-title" type="text" className={`form-control ${errors.title ? 'is-invalid' : ''}`} {...register('title')} />
            {errors.title ? <div className="invalid-feedback">{errors.title.message}</div> : null}
          </div>

          <div className="mb-3">
            <label htmlFor="announcement-body" className="form-label">
              {t.body}
            </label>
            <textarea id="announcement-body" rows={3} className={`form-control ${errors.body ? 'is-invalid' : ''}`} {...register('body')} />
            {errors.body ? <div className="invalid-feedback d-block">{errors.body.message}</div> : null}
          </div>

          <div className="mb-3">
            <label htmlFor="announcement-level" className="form-label">
              {t.level}
            </label>
            <select id="announcement-level" className="form-select" {...register('level')}>
              <option value={AnnouncementLevel.INFO}>{en.adminAnnouncements.levelInfo}</option>
              <option value={AnnouncementLevel.WARNING}>{en.adminAnnouncements.levelWarning}</option>
            </select>
          </div>

          <div className="row">
            <div className="col-sm-6 mb-3">
              <label htmlFor="announcement-starts-at" className="form-label">
                {t.startsAt}
              </label>
              <input
                id="announcement-starts-at"
                type="datetime-local"
                className={`form-control ${errors.startsAtLocal ? 'is-invalid' : ''}`}
                {...register('startsAtLocal')}
              />
              {errors.startsAtLocal ? <div className="invalid-feedback d-block">{errors.startsAtLocal.message}</div> : null}
            </div>
            <div className="col-sm-6 mb-3">
              <label htmlFor="announcement-ends-at" className="form-label">
                {t.endsAt}
              </label>
              <input
                id="announcement-ends-at"
                type="datetime-local"
                className={`form-control ${errors.endsAtLocal ? 'is-invalid' : ''}`}
                {...register('endsAtLocal')}
              />
              {errors.endsAtLocal ? <div className="invalid-feedback d-block">{errors.endsAtLocal.message}</div> : null}
            </div>
          </div>

          {isEdit ? (
            <div className="form-check mb-3">
              <input id="announcement-is-active" type="checkbox" className="form-check-input" {...register('isActive')} />
              <label htmlFor="announcement-is-active" className="form-check-label">
                {t.isActive}
              </label>
            </div>
          ) : null}

          <div className="d-flex gap-2 justify-content-end">
            <button type="button" className="btn btn-outline-secondary" onClick={handleClose}>
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
