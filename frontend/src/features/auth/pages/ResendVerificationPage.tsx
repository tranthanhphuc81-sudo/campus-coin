/**
 * ResendVerificationPage.tsx
 * Public "resend verification email" page (`/resend-verification`). Always shows the same
 * success message after a 202, regardless of whether the account exists or is already verified
 * (same non-enumeration contract as `/auth/forgot-password`).
 * Exports: default (ResendVerificationPage)
 * Spec: docs/spec/09 §9 (auth) · Rules: BR-AU-03
 */
import { emailOnlySchema, type EmailOnlyInput } from '@campuscoin/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { PageHeader } from '../../../components/PageHeader';
import { en } from '../../../i18n/en';
import { apiClient } from '../../../lib/apiClient/apiClient';
import type { ApiError } from '../../../lib/apiClient/apiError';

/** Public page to request a new verification email when the original link expired or was lost. */
export default function ResendVerificationPage() {
  const [sent, setSent] = useState(false);
  const [genericError, setGenericError] = useState<string | null>(null);
  const emailId = useId();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EmailOnlyInput>({
    resolver: zodResolver(emailOnlySchema),
    defaultValues: { email: '' },
  });

  /** Always ends in `sent` on a 202 — never reveals whether the account exists. */
  async function onSubmit(values: EmailOnlyInput) {
    setGenericError(null);
    try {
      await apiClient.post('/auth/resend-verification', values);
      setSent(true);
    } catch (error) {
      const apiError = error as ApiError;
      setGenericError(apiError.status === 429 ? en.errors.rateLimited : en.errors.generic);
    }
  }

  return (
    <>
      <PageHeader title={en.auth.resendVerification.title} />
      <div className="row">
        <div className="col-12 col-md-8 col-lg-6">
          {sent ? (
            <p role="status">{en.auth.resendVerification.success}</p>
          ) : (
            <>
              <p>{en.auth.resendVerification.body}</p>
              {genericError ? (
                <div className="alert alert-danger" role="alert">
                  {genericError}
                </div>
              ) : null}
              <form noValidate onSubmit={handleSubmit(onSubmit)}>
                <div className="mb-3">
                  <label htmlFor={emailId} className="form-label">
                    {en.auth.resendVerification.email}
                  </label>
                  <input
                    id={emailId}
                    type="email"
                    autoComplete="email"
                    className={`form-control ${errors.email ? 'is-invalid' : ''}`}
                    aria-describedby={errors.email ? `${emailId}-error` : undefined}
                    aria-invalid={errors.email ? true : undefined}
                    {...register('email')}
                  />
                  {errors.email ? (
                    <div id={`${emailId}-error`} className="invalid-feedback">
                      {errors.email.message}
                    </div>
                  ) : null}
                </div>
                <button
                  type="submit"
                  className="btn btn-primary w-100"
                  disabled={isSubmitting}
                  aria-busy={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
                      {en.auth.resendVerification.submitting}
                    </>
                  ) : (
                    en.auth.resendVerification.submit
                  )}
                </button>
              </form>
            </>
          )}
          <p className="mt-3">
            <Link to="/login">{en.auth.resendVerification.backToLogin}</Link>
          </p>
        </div>
      </div>
    </>
  );
}
