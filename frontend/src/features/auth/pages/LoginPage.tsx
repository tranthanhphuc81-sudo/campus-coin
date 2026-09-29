/**
 * LoginPage.tsx
 * Public login page (`/login`). React Hook Form + Zod `loginSchema`, submits through
 * `useAuth().login`. Errors are shown as a single generic alert (BR-AU-03: never reveal which
 * credential was wrong, never point at a specific field). On success, prefetches the dashboard
 * summary (P09) then sends first-time users to onboarding and everyone else back to the page
 * they were trying to reach.
 * Exports: default (LoginPage)
 * Spec: docs/spec/09 §9 (auth) · Rules: BR-AU-03
 */
import { loginSchema } from '@campuscoin/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router';
import type { z } from 'zod';
import { PageHeader } from '../../../components/PageHeader';
import { getDashboardSummary } from '../../dashboard/api';
import { dashboardSummaryQueryKey } from '../../dashboard/hooks';
import { en } from '../../../i18n/en';
import type { ApiError } from '../../../lib/apiClient/apiError';
import { useAuth } from '../../../lib/auth/AuthContext';
import { currentLocalMonth } from '../../../lib/dates';
import { queryClient } from '../../../lib/queryClient';

/** Pre-parse form shape (rememberMe optional before Zod applies its `.default(false)`). */
type LoginFormValues = z.input<typeof loginSchema>;

/** Login error shown above the form; `showResendLink` is set only for `email-not-verified`. */
interface LoginErrorState {
  message: string;
  showResendLink: boolean;
}

/** Maps a login `ApiError` to the single generic message BR-AU-03 allows. */
function mapLoginError(error: ApiError): LoginErrorState {
  switch (error.type) {
    case 'account-locked':
      return { message: en.errors.accountLocked, showResendLink: false };
    case 'email-not-verified':
      return { message: en.errors.emailNotVerified, showResendLink: true };
    case 'account-disabled':
      return { message: en.errors.accountDisabled, showResendLink: false };
    case 'rate-limited':
      return { message: en.errors.rateLimited, showResendLink: false };
    case 'unauthenticated':
      return { message: en.auth.login.genericError, showResendLink: false };
    default:
      return { message: en.errors.generic, showResendLink: false };
  }
}

/** Reads the local "has completed onboarding" flag; treats storage failures as "not onboarded". */
function hasCompletedOnboarding(userId: string): boolean {
  try {
    return window.localStorage.getItem(`cc.onboarding.${userId}`) === 'done';
  } catch {
    return false;
  }
}

/** Public login page: email/password + remember-me, delegates the session to `useAuth().login`. */
export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<LoginErrorState | null>(null);

  const emailId = useId();
  const passwordId = useId();
  const rememberId = useId();
  const errorId = useId();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', rememberMe: false },
  });

  /** Logs in, then routes to onboarding (first login) or the originally requested page. */
  async function onSubmit(values: LoginFormValues) {
    setLoginError(null);
    try {
      const user = await login(values);
      // Prefetch the dashboard summary right after login so `/app` renders instantly for the
      // common case (the user lands there next); a failed prefetch is silently ignored — the
      // dashboard page's own query will just fetch normally when it mounts.
      const month = currentLocalMonth(user.timezone);
      void queryClient.prefetchQuery({
        queryKey: dashboardSummaryQueryKey({ month }),
        queryFn: () => getDashboardSummary({ month }),
      });
      if (!hasCompletedOnboarding(user.id)) {
        navigate('/app/onboarding', { replace: true });
        return;
      }
      const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
      navigate(from || '/app', { replace: true });
    } catch (error) {
      setLoginError(mapLoginError(error as ApiError));
    }
  }

  return (
    <>
      <PageHeader title={en.auth.login.title} />
      <div className="row">
        <div className="col-12 col-md-8 col-lg-6">
          {loginError ? (
            <div id={errorId} className="alert alert-danger" role="alert">
              <div>{loginError.message}</div>
              {loginError.showResendLink ? (
                <div className="mt-1">
                  {en.auth.login.resendPrompt} <Link to="/resend-verification">{en.auth.login.resendLink}</Link>
                </div>
              ) : null}
            </div>
          ) : null}

          <form noValidate onSubmit={handleSubmit(onSubmit)}>
            <div className="mb-3">
              <label htmlFor={emailId} className="form-label">
                {en.auth.login.email}
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

            <div className="mb-3">
              <label htmlFor={passwordId} className="form-label">
                {en.auth.login.password}
              </label>
              <div className="input-group">
                <input
                  id={passwordId}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
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

            <div className="d-flex justify-content-between align-items-center mb-3">
              <div className="form-check">
                <input id={rememberId} type="checkbox" className="form-check-input" {...register('rememberMe')} />
                <label htmlFor={rememberId} className="form-check-label">
                  {en.auth.login.rememberMe}
                </label>
              </div>
              <Link to="/forgot-password">{en.auth.login.forgotLink}</Link>
            </div>

            <button type="submit" className="btn btn-primary w-100" disabled={isSubmitting} aria-busy={isSubmitting}>
              {isSubmitting ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
                  {en.auth.login.submitting}
                </>
              ) : (
                en.auth.login.submit
              )}
            </button>
          </form>

          <p className="mt-3">
            {en.auth.login.noAccount} <Link to="/register">{en.auth.login.registerLink}</Link>
          </p>
        </div>
      </div>
    </>
  );
}
