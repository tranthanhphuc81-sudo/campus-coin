/**
 * RegisterPage.tsx
 * Public registration page (`/register`). React Hook Form + Zod (`registerSchema` extended
 * locally with a UI-only "agree to terms" checkbox that is never sent to the API — the shared
 * schema is `.strict()` and would 422 on an unexpected field). On success shows a "check your
 * email" panel instead of auto-navigating (BR-AU-03: registration never reveals whether the
 * email already existed, so there is nothing more useful to say than "check your email").
 * Exports: default (RegisterPage)
 * Spec: docs/spec/09 §9 (auth) · Rules: BR-AU-01, BR-AU-03
 */
import { registerSchema } from '@campuscoin/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useId, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Link } from 'react-router';
import { z } from 'zod';
import { PasswordStrengthMeter } from '../../../components/PasswordStrengthMeter';
import { PageHeader } from '../../../components/PageHeader';
import { en } from '../../../i18n/en';
import { apiClient } from '../../../lib/apiClient/apiClient';
import { applyFieldErrors, type ApiError } from '../../../lib/apiClient/apiError';

/**
 * Registration form schema: the shared `registerSchema` plus a UI-only `agreeToTerms` checkbox.
 * `agreeToTerms` is stripped before the request body is built (see `onSubmit`).
 */
const registerFormSchema = registerSchema.extend({
  agreeToTerms: z.boolean().refine((value) => value === true, {
    message: en.errors.validationFailed,
  }),
});

type RegisterFormValues = z.infer<typeof registerFormSchema>;

/** Public registration page: collects name/email/password, then shows a "check your email" panel. */
export default function RegisterPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [genericError, setGenericError] = useState<string | null>(null);
  const [registered, setRegistered] = useState(false);

  const fullNameId = useId();
  const emailId = useId();
  const passwordId = useId();
  const agreeId = useId();

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: { fullName: '', email: '', password: '', agreeToTerms: false },
  });

  // `useWatch` (not `watch`) so this component stays compiler-memoizable.
  const password = useWatch({ control, name: 'password' });

  /** Submits `{fullName, email, password}` only — `agreeToTerms` never leaves the browser. */
  async function onSubmit(values: RegisterFormValues) {
    setGenericError(null);
    const { fullName, email, password: pwd } = values;
    try {
      await apiClient.post('/auth/register', { fullName, email, password: pwd });
      setRegistered(true);
    } catch (error) {
      const apiError = error as ApiError;
      if (apiError.status === 422) {
        applyFieldErrors(setError, apiError);
      } else if (apiError.status === 429) {
        setGenericError(en.errors.rateLimited);
      } else {
        setGenericError(en.errors.generic);
      }
    }
  }

  if (registered) {
    return (
      <>
        <PageHeader title={en.auth.register.successTitle} />
        <div className="row">
          <div className="col-12 col-md-8 col-lg-6">
            <p>{en.auth.register.successBody}</p>
            <Link to="/login" className="btn btn-primary">
              {en.auth.login.title}
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title={en.auth.register.title} />
      <div className="row">
        <div className="col-12 col-md-8 col-lg-6">
          {genericError ? (
            <div className="alert alert-danger alert-dismissible" role="alert">
              {genericError}
              <button
                type="button"
                className="btn-close"
                aria-label={en.common.close}
                onClick={() => setGenericError(null)}
              />
            </div>
          ) : null}
          <form noValidate onSubmit={handleSubmit(onSubmit)}>
            <div className="mb-3">
              <label htmlFor={fullNameId} className="form-label">
                {en.auth.register.fullName}
              </label>
              <input
                id={fullNameId}
                type="text"
                autoComplete="name"
                className={`form-control ${errors.fullName ? 'is-invalid' : ''}`}
                aria-describedby={errors.fullName ? `${fullNameId}-error` : undefined}
                aria-invalid={errors.fullName ? true : undefined}
                {...register('fullName')}
              />
              {errors.fullName ? (
                <div id={`${fullNameId}-error`} className="invalid-feedback">
                  {errors.fullName.message}
                </div>
              ) : null}
            </div>

            <div className="mb-3">
              <label htmlFor={emailId} className="form-label">
                {en.auth.register.email}
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

            <div className="mb-1">
              <label htmlFor={passwordId} className="form-label">
                {en.auth.register.password}
              </label>
              <div className="input-group">
                <input
                  id={passwordId}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  className={`form-control ${errors.password ? 'is-invalid' : ''}`}
                  aria-describedby={errors.password ? `${passwordId}-error` : undefined}
                  aria-invalid={errors.password ? true : undefined}
                  {...register('password')}
                />
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? en.auth.register.hidePassword : en.auth.register.showPassword}
                </button>
                {errors.password ? (
                  <div id={`${passwordId}-error`} className="invalid-feedback">
                    {errors.password.message}
                  </div>
                ) : null}
              </div>
            </div>
            <PasswordStrengthMeter password={password} />

            <div className="form-check mb-3 mt-3">
              <input
                id={agreeId}
                type="checkbox"
                className={`form-check-input ${errors.agreeToTerms ? 'is-invalid' : ''}`}
                aria-describedby={errors.agreeToTerms ? `${agreeId}-error` : undefined}
                aria-invalid={errors.agreeToTerms ? true : undefined}
                {...register('agreeToTerms')}
              />
              <label htmlFor={agreeId} className="form-check-label">
                {en.auth.register.agreeTermsPrefix} <Link to="/terms">{en.auth.register.termsLink}</Link>{' '}
                {en.auth.register.andLabel} <Link to="/privacy">{en.auth.register.privacyLink}</Link>
              </label>
              {errors.agreeToTerms ? (
                <div id={`${agreeId}-error`} className="invalid-feedback">
                  {errors.agreeToTerms.message}
                </div>
              ) : null}
            </div>

            <button type="submit" className="btn btn-primary w-100" disabled={isSubmitting} aria-busy={isSubmitting}>
              {isSubmitting ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
                  {en.auth.register.submitting}
                </>
              ) : (
                en.auth.register.submit
              )}
            </button>
          </form>

          <p className="mt-3">
            {en.auth.register.haveAccount} <Link to="/login">{en.auth.register.logInLink}</Link>
          </p>
        </div>
      </div>
    </>
  );
}
