/**
 * SecurityTab.tsx
 * "Security" tab of Profile & Settings: change-password form and active-sessions management
 * (view every signed-in device, revoke one or all of them).
 * Exports: SecurityTab
 * Spec: docs/spec/05a §5.2 (security settings) · docs/spec/07 §7.3.1 (`/me/password`, `/me/sessions`)
 */
import { changePasswordSchema, type ChangePasswordInput } from '@campuscoin/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import Spinner from 'react-bootstrap/Spinner';
import { useNavigate } from 'react-router';
import { ConfirmModal } from '../../../components/ConfirmModal';
import { ErrorState } from '../../../components/ErrorState';
import { PasswordStrengthMeter } from '../../../components/PasswordStrengthMeter';
import { TableSkeleton } from '../../../components/Skeletons';
import { useToast } from '../../../components/ToastProvider';
import { en } from '../../../i18n/en';
import { apiClient } from '../../../lib/apiClient/apiClient';
import { applyFieldErrors, type ApiError } from '../../../lib/apiClient/apiError';
import { useAuth } from '../../../lib/auth/AuthContext';

/** One entry of `GET /me/sessions`: an active refresh-token session tied to a device/browser. */
interface SessionDto {
  id: string;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  current: boolean;
}

const SESSIONS_QUERY_KEY = ['me', 'sessions'] as const;

/** Change-password form + active-sessions management (view/revoke). */
export function SecurityTab() {
  return (
    <div className="d-flex flex-column gap-4">
      <ChangePasswordForm />
      <ActiveSessionsSection />
    </div>
  );
}

/**
 * Change-password form: current + new password, with a client-side strength meter under the
 * new-password field. A wrong current password comes back as a generic 401 (never a field
 * error, to avoid confirming account details), so it is shown as a single alert instead.
 */
function ChangePasswordForm() {
  const { showToast } = useToast();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '' },
  });
  // `useWatch` (not `watch`) so this component stays compiler-memoizable.
  const newPassword = useWatch({ control, name: 'newPassword' });

  async function onSubmit(data: ChangePasswordInput) {
    setServerError(null);
    try {
      await apiClient.patch('/me/password', data);
      reset();
      showToast({ message: en.profileSettings.security.success });
    } catch (err) {
      const error = err as ApiError;
      if (error.status === 422) {
        applyFieldErrors(setError, error);
      } else {
        setServerError(error.detail ?? en.errors.generic);
      }
    }
  }

  return (
    <section>
      <h2 className="h5">{en.profileSettings.security.changePasswordTitle}</h2>
      {serverError ? (
        <div className="alert alert-danger" role="alert">
          {serverError}
        </div>
      ) : null}
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="col-12 col-md-6">
        <div className="mb-3">
          <label htmlFor="currentPassword" className="form-label">
            {en.profileSettings.security.currentPassword}
          </label>
          <input
            id="currentPassword"
            type="password"
            autoComplete="current-password"
            className={`form-control ${errors.currentPassword ? 'is-invalid' : ''}`}
            aria-describedby={errors.currentPassword ? 'currentPassword-error' : undefined}
            {...register('currentPassword')}
          />
          {errors.currentPassword ? (
            <div id="currentPassword-error" className="invalid-feedback">
              {errors.currentPassword.message}
            </div>
          ) : null}
        </div>
        <div className="mb-3">
          <label htmlFor="newPassword" className="form-label">
            {en.profileSettings.security.newPassword}
          </label>
          <input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            className={`form-control ${errors.newPassword ? 'is-invalid' : ''}`}
            aria-describedby={errors.newPassword ? 'newPassword-error' : undefined}
            {...register('newPassword')}
          />
          {errors.newPassword ? (
            <div id="newPassword-error" className="invalid-feedback">
              {errors.newPassword.message}
            </div>
          ) : null}
          <PasswordStrengthMeter password={newPassword ?? ''} />
        </div>
        <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Spinner animation="border" size="sm" className="me-2" aria-hidden="true" />
              {en.profileSettings.security.submitting}
            </>
          ) : (
            en.profileSettings.security.submit
          )}
        </button>
      </form>
    </section>
  );
}

/**
 * Active-sessions list: every signed-in device with its last-active time, a badge (not a revoke
 * button) on the current device, a "Log out" button on every other one, and a "log out of all
 * sessions" action that also ends the current session (so it redirects to `/login`).
 */
function ActiveSessionsSection() {
  const { logout } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [confirmSessionId, setConfirmSessionId] = useState<string | null>(null);
  const [confirmRevokeAll, setConfirmRevokeAll] = useState(false);

  const sessionsQuery = useQuery<SessionDto[]>({
    queryKey: SESSIONS_QUERY_KEY,
    queryFn: () => apiClient.get<SessionDto[]>('/me/sessions').then((r) => r.data),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/me/sessions/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SESSIONS_QUERY_KEY });
      showToast({ message: en.profileSettings.security.revoked });
    },
  });

  /** Ends every session server-side (including this one), then best-effort clears local state. */
  async function handleConfirmRevokeAll() {
    setConfirmRevokeAll(false);
    try {
      await apiClient.post('/auth/logout-all');
      showToast({ message: en.profileSettings.security.revokedAll });
    } finally {
      // Server session is already gone either way; this just clears local state and redirects.
      await logout();
      navigate('/login', { replace: true });
    }
  }

  const sessions = sessionsQuery.data ?? [];
  const hasOtherSessions = sessions.some((session) => !session.current);

  return (
    <section>
      <h2 className="h5">{en.profileSettings.security.sessionsTitle}</h2>
      <p className="text-body-secondary">{en.profileSettings.security.sessionsBody}</p>

      {sessionsQuery.isLoading ? (
        <div role="status" aria-live="polite">
          <TableSkeleton rows={3} />
        </div>
      ) : sessionsQuery.isError ? (
        <ErrorState onRetry={() => void sessionsQuery.refetch()} />
      ) : (
        <ul className="list-unstyled mb-3">
          {sessions.map((session) => (
            <li
              key={session.id}
              className="d-flex align-items-center justify-content-between gap-2 py-2 border-bottom"
            >
              <div className="d-flex align-items-center gap-2">
                <i className="bi bi-laptop fs-4 text-body-secondary" aria-hidden="true" />
                <div>
                  <div>{session.userAgent ?? 'Unknown device'}</div>
                  <small className="text-body-secondary">
                    {en.profileSettings.security.lastActive(new Date(session.lastUsedAt).toLocaleString())}
                  </small>
                </div>
              </div>
              {session.current ? (
                <span className="badge text-bg-secondary">{en.profileSettings.security.currentSessionBadge}</span>
              ) : (
                <button
                  type="button"
                  className="btn btn-outline-danger btn-sm"
                  onClick={() => setConfirmSessionId(session.id)}
                >
                  {en.profileSettings.security.revoke}
                </button>
              )}
            </li>
          ))}
          {!hasOtherSessions ? (
            <li className="py-2 text-body-secondary small">{en.profileSettings.security.noOtherSessions}</li>
          ) : null}
        </ul>
      )}

      <button type="button" className="btn btn-outline-danger" onClick={() => setConfirmRevokeAll(true)}>
        {en.profileSettings.security.revokeAll}
      </button>

      <ConfirmModal
        show={confirmSessionId !== null}
        title={en.profileSettings.security.revokeConfirmTitle}
        body={en.profileSettings.security.revokeConfirmBody}
        variant="danger"
        onCancel={() => setConfirmSessionId(null)}
        onConfirm={() => {
          if (confirmSessionId) revokeMutation.mutate(confirmSessionId);
          setConfirmSessionId(null);
        }}
      />
      <ConfirmModal
        show={confirmRevokeAll}
        title={en.profileSettings.security.revokeAllConfirmTitle}
        body={en.profileSettings.security.revokeAllConfirmBody}
        variant="danger"
        onCancel={() => setConfirmRevokeAll(false)}
        onConfirm={() => void handleConfirmRevokeAll()}
      />
    </section>
  );
}
