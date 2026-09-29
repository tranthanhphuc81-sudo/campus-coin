/**
 * DeleteAccountModal.tsx
 * Confirms and submits an account-deletion request (`DELETE /me`, docs/spec/09 §9.14): re-enter
 * the current password and type the exact confirmation phrase before the destructive action is
 * enabled. On success the account is already disabled server-side and the refresh cookie already
 * cleared, so this only needs to clear local auth state and redirect to `/login`.
 * Exports: DeleteAccountModal
 * Spec: docs/spec/09 §9.14 · docs/spec/07 §7.3.1 (`DELETE /me`)
 */
import { DELETE_ACCOUNT_CONFIRM_PHRASE, deleteAccountSchema, type DeleteAccountInput } from '@campuscoin/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import Modal from 'react-bootstrap/Modal';
import Spinner from 'react-bootstrap/Spinner';
import { useNavigate } from 'react-router';
import { useToast } from '../../../components/ToastProvider';
import { en } from '../../../i18n/en';
import { applyFieldErrors, type ApiError } from '../../../lib/apiClient/apiError';
import { useAuth } from '../../../lib/auth/AuthContext';
import { useDeleteAccountMutation } from '../hooks';

interface DeleteAccountModalProps {
  show: boolean;
  onClose: () => void;
}

/**
 * Modal that gates `DELETE /me` behind re-authentication + a literal confirmation phrase. Uses
 * `deleteAccountSchema` (from `@campuscoin/shared`) directly as the RHF resolver, so client-side
 * validation can never drift from what the server actually enforces.
 */
export function DeleteAccountModal({ show, onClose }: DeleteAccountModalProps) {
  const t = en.profileSettings.privacy.deleteModal;
  const { logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const deleteMutation = useDeleteAccountMutation();

  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<DeleteAccountInput>({
    resolver: zodResolver(deleteAccountSchema),
    // `confirm` is a `z.literal(DELETE_ACCOUNT_CONFIRM_PHRASE)` — an empty default intentionally
    // starts the field invalid until the user types the exact phrase (cast: RHF still needs a
    // concrete string default to keep the input controlled).
    defaultValues: { password: '', confirm: '' as typeof DELETE_ACCOUNT_CONFIRM_PHRASE },
  });
  // `useWatch` (not `watch`) so this component stays compiler-memoizable.
  const confirmValue = useWatch({ control, name: 'confirm' });
  // Case-sensitive exact match gates the submit button — a stronger guard than zod's own literal
  // error message, which is not meant to be user-facing copy.
  const isPhraseMatched = confirmValue === DELETE_ACCOUNT_CONFIRM_PHRASE;

  function handleClose() {
    if (isSubmitting) return;
    reset();
    setServerError(null);
    onClose();
  }

  async function onSubmit(values: DeleteAccountInput) {
    setServerError(null);
    try {
      await deleteMutation.mutateAsync(values);
      showToast({ message: t.success });
      reset();
      // The server already revoked the session; this only clears local state (best-effort) and
      // sends the user to the login page.
      await logout();
      navigate('/login', { replace: true });
    } catch (err) {
      const error = err as ApiError;
      if (error.status === 422) {
        applyFieldErrors(setError, error);
      } else if (error.status === 429) {
        showToast({ message: t.rateLimited });
      } else {
        setServerError(error.detail ?? en.errors.generic);
      }
    }
  }

  return (
    <Modal show={show} onHide={handleClose} centered>
      <Modal.Header closeButton>
        <Modal.Title as="h2" className="h5 mb-0">
          {t.title}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>{t.warningBody}</p>
        <p className="text-body-secondary small">{t.warningSupport}</p>
        {serverError ? (
          <div className="alert alert-danger" role="alert">
            {serverError}
          </div>
        ) : null}
        <form id="delete-account-form" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="mb-3">
            <label htmlFor="delete-account-password" className="form-label">
              {t.passwordLabel}
            </label>
            <input
              id="delete-account-password"
              type="password"
              autoComplete="current-password"
              className={`form-control ${errors.password ? 'is-invalid' : ''}`}
              aria-describedby={errors.password ? 'delete-account-password-error' : undefined}
              {...register('password')}
            />
            {errors.password ? (
              <div id="delete-account-password-error" className="invalid-feedback">
                {errors.password.message}
              </div>
            ) : null}
          </div>
          <div className="mb-3">
            <label htmlFor="delete-account-confirm" className="form-label">
              {t.confirmLabel(DELETE_ACCOUNT_CONFIRM_PHRASE)}
            </label>
            <input
              id="delete-account-confirm"
              type="text"
              autoComplete="off"
              className={`form-control ${errors.confirm ? 'is-invalid' : ''}`}
              aria-describedby="delete-account-confirm-hint"
              {...register('confirm')}
            />
            <div id="delete-account-confirm-hint" className="form-text">
              {errors.confirm ? t.confirmError : t.confirmHint}
            </div>
          </div>
        </form>
      </Modal.Body>
      <Modal.Footer>
        <button type="button" className="btn btn-outline-secondary" disabled={isSubmitting} onClick={handleClose}>
          {en.common.cancel}
        </button>
        <button type="submit" form="delete-account-form" className="btn btn-danger" disabled={!isPhraseMatched || isSubmitting}>
          {isSubmitting ? (
            <>
              <Spinner animation="border" size="sm" className="me-2" aria-hidden="true" />
              {t.submitting}
            </>
          ) : (
            t.submit
          )}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
