/**
 * ResetPasswordPage.tsx
 * Public "reset password" page (`/reset-password?token=...`). The token comes only from the URL
 * (never a user-editable field); the form itself just collects the new password. On an
 * `invalid-token` failure it swaps to a dead-end panel pointing back at `/forgot-password`
 * rather than re-showing a form bound to a token that will never work.
 *
 * Security hardening (C-H1, docs/security/review-p19.md): the token is a live, still-usable
 * secret (30 min TTL) — it is read into state once on mount and then immediately stripped from
 * the visible URL/history via `history.replaceState`, so it can't leak through a same-page
 * third-party script (Tawk.to reporting `location.href`), browser history sync, referrer headers
 * on outbound requests from this page, or anything else inspecting the URL later in the session.
 * `TawkWidget` also denylists this route as a second, independent layer of defence.
 * Exports: default (ResetPasswordPage)
 * Spec: docs/spec/09 §9 (auth) · docs/security/review-p19.md (C-H1)
 */
import { resetPasswordSchema } from '@campuscoin/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useId, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Link, useSearchParams } from 'react-router';
import type { z } from 'zod';
import { PageHeader } from '../../../components/PageHeader';
import { PasswordStrengthMeter } from '../../../components/PasswordStrengthMeter';
import { en } from '../../../i18n/en';
import { apiClient } from '../../../lib/apiClient/apiClient';
import { applyFieldErrors, type ApiError } from '../../../lib/apiClient/apiError';

/** Client-side form schema: only `newPassword` — `token` is read from the URL, not user input. */
const resetFormSchema = resetPasswordSchema.omit({ token: true });
type ResetFormValues = z.infer<typeof resetFormSchema>;

type ResetStatus = 'form' | 'success' | 'failure';

/** Public page reached from the password-reset link sent by `/auth/forgot-password`. */
export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  // Captured once, at mount, before `history.replaceState` below removes it from the URL.
  const [token] = useState(() => searchParams.get('token'));
  const [status, setStatus] = useState<ResetStatus>('form');
  const [genericError, setGenericError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const passwordId = useId();

  useEffect(() => {
    if (!token) return;
    // BR (security, C-H1): strip the token from the visible URL right after it's captured into
    // state — `replaceState` (not `pushState`) so it doesn't add a back/forward history entry.
    window.history.replaceState(null, '', window.location.pathname);
  }, [token]);

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ResetFormValues>({
    resolver: zodResolver(resetFormSchema),
    defaultValues: { newPassword: '' },
  });

  // `useWatch` (not `watch`) so this component stays compiler-memoizable.
  const newPassword = useWatch({ control, name: 'newPassword' });

  /** Submits `{token, newPassword}`; the token is fixed at mount time from the URL. */
  async function onSubmit(values: ResetFormValues) {
    if (!token) return;
    setGenericError(null);
    try {
      await apiClient.post('/auth/reset-password', { token, newPassword: values.newPassword });
      setStatus('success');
    } catch (error) {
      const apiError = error as ApiError;
      if (apiError.status === 422) {
        applyFieldErrors(setError, apiError);
      } else if (apiError.type === 'invalid-token' || apiError.status === 400) {
        setStatus('failure');
      } else if (apiError.status === 429) {
        setGenericError(en.errors.rateLimited);
      } else {
        setGenericError(en.errors.generic);
      }
    }
  }

  if (!token) {
    return (
      <>
        <PageHeader title={en.auth.resetPassword.title} />
        <p>{en.auth.resetPassword.missingToken}</p>
        <Link to="/forgot-password">{en.auth.resetPassword.requestNewLink}</Link>
      </>
    );
  }

  if (status === 'success') {
    return (
      <>
        <PageHeader title={en.auth.resetPassword.successTitle} />
        <p>{en.auth.resetPassword.success}</p>
        <Link to="/login">{en.auth.resetPassword.logInLink}</Link>
      </>
    );
  }

  if (status === 'failure') {
    return (
      <>
        <PageHeader title={en.auth.resetPassword.failureTitle} />
        <p>{en.auth.resetPassword.failure}</p>
        <Link to="/forgot-password">{en.auth.resetPassword.requestNewLink}</Link>
      </>
    );
  }

  return (
    <>
      <PageHeader title={en.auth.resetPassword.title} />
      <div className="row">
        <div className="col-12 col-md-8 col-lg-6">
          {genericError ? (
            <div className="alert alert-danger" role="alert">
              {genericError}
            </div>
          ) : null}
          <form noValidate onSubmit={handleSubmit(onSubmit)}>
            <div className="mb-1">
              <label htmlFor={passwordId} className="form-label">
                {en.auth.resetPassword.newPassword}
              </label>
              <div className="input-group">
                <input
                  id={passwordId}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  className={`form-control ${errors.newPassword ? 'is-invalid' : ''}`}
                  aria-describedby={errors.newPassword ? `${passwordId}-error` : undefined}
                  aria-invalid={errors.newPassword ? true : undefined}
                  {...register('newPassword')}
                />
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? en.auth.register.hidePassword : en.auth.register.showPassword}
                </button>
                {errors.newPassword ? (
                  <div id={`${passwordId}-error`} className="invalid-feedback">
                    {errors.newPassword.message}
                  </div>
                ) : null}
              </div>
            </div>
            <PasswordStrengthMeter password={newPassword} />

            <button
              type="submit"
              className="btn btn-primary w-100 mt-3"
              disabled={isSubmitting}
              aria-busy={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
                  {en.auth.resetPassword.submitting}
                </>
              ) : (
                en.auth.resetPassword.submit
              )}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
