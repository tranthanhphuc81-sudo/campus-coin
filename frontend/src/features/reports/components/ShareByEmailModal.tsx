/**
 * ShareByEmailModal.tsx
 * "Share by email" modal (docs/spec/05b §5.8): recipient email + optional personal message,
 * `POST /reports/monthly/share` for `month`. Never shows or accepts a public link — the server
 * only ever emails the PDF as an attachment.
 * Exports: ShareByEmailModal
 * Spec: docs/spec/05b §5.8 · Table 46 (5/day rate limit)
 */
import { REPORT_SHARE_MESSAGE_MAX_CHARS, emailSchema } from '@campuscoin/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import Modal from 'react-bootstrap/Modal';
import Spinner from 'react-bootstrap/Spinner';
import { z } from 'zod';
import { en } from '../../../i18n/en';
import { applyFieldErrors, type ApiError } from '../../../lib/apiClient/apiError';
import { useToast } from '../../../components/ToastProvider';
import { useShareMonthlyReportMutation } from '../hooks';

const formSchema = z.object({
  toEmail: emailSchema,
  message: z.string().trim().max(REPORT_SHARE_MESSAGE_MAX_CHARS).optional(),
});
type FormValues = z.infer<typeof formSchema>;

interface ShareByEmailModalProps {
  show: boolean;
  onClose: () => void;
  /** First day of the month whose report is being shared. */
  month: string;
}

/** Modal collecting a recipient email + optional message, then queues the monthly PDF email. */
export function ShareByEmailModal({ show, onClose, month }: ShareByEmailModalProps) {
  const { showToast } = useToast();
  const [serverError, setServerError] = useState<string | null>(null);
  const shareMutation = useShareMonthlyReportMutation();

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: { toEmail: '', message: '' } });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      await shareMutation.mutateAsync({ month, toEmail: values.toEmail, message: values.message?.trim() ? values.message.trim() : undefined });
      reset();
      onClose();
      showToast({ message: en.reports.shareSuccess(values.toEmail) });
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
          {en.reports.shareModalTitle}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="text-body-secondary small">{en.reports.shareModalHint}</p>
        {serverError ? (
          <div className="alert alert-danger" role="alert">
            {serverError}
          </div>
        ) : null}
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="mb-3">
            <label htmlFor="share-to-email" className="form-label">
              {en.reports.shareToEmail}
            </label>
            <input
              id="share-to-email"
              type="email"
              className={`form-control ${errors.toEmail ? 'is-invalid' : ''}`}
              {...register('toEmail')}
            />
            {errors.toEmail ? <div className="invalid-feedback">{errors.toEmail.message}</div> : null}
          </div>
          <div className="mb-3">
            <label htmlFor="share-message" className="form-label">
              {en.reports.shareMessage}
            </label>
            <textarea
              id="share-message"
              rows={3}
              maxLength={REPORT_SHARE_MESSAGE_MAX_CHARS}
              className={`form-control ${errors.message ? 'is-invalid' : ''}`}
              {...register('message')}
            />
            {errors.message ? <div className="invalid-feedback">{errors.message.message}</div> : null}
          </div>
          <div className="d-flex gap-2 justify-content-end">
            <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
              {en.common.cancel}
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Spinner animation="border" size="sm" className="me-2" aria-hidden="true" />
                  {en.reports.sharing}
                </>
              ) : (
                en.reports.shareSend
              )}
            </button>
          </div>
        </form>
      </Modal.Body>
    </Modal>
  );
}
