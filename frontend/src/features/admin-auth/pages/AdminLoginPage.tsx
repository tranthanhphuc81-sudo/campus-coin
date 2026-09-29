/**
 * AdminLoginPage.tsx
 * Standalone admin login page (`/admin/login`), deliberately outside `ProtectedRoute` /
 * `AdminLayout`. Implements the mandatory 2-step admin sign-in flow:
 *   1. password (`POST /admin/auth/login`) — returns a short-lived `mfaToken`;
 *   2. a 6-digit TOTP code, or a one-time recovery code (`POST /admin/auth/mfa/verify`).
 * TOTP enrolment (QR code + recovery codes) happens once, out-of-band, at `admin:create` CLI
 * time (P19 A-M4 security fix) — this page never sees or displays enrolment material, only the
 * regular login/verify challenge for an already-enrolled admin.
 * Local state machine: 'credentials' -> 'mfa' -> done.
 * Exports: default (AdminLoginPage)
 * Spec: docs/spec/09 §9.5 (admin MFA login)
 */
import { adminLoginSchema, type AdminLoginInput } from '@campuscoin/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState, type FormEvent } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import type { ApiError } from '../../../lib/apiClient/apiError';
import { setAccessToken } from '../../../lib/apiClient/tokenStore';
import { useAuth } from '../../../lib/auth/AuthContext';
import { en } from '../../../i18n/en';
import { adminLogin, adminMfaVerify, type AdminMfaVerifyResponse } from '../api';

/** Which of the 2 steps of the flow is currently shown. */
type Step = 'credentials' | 'mfa';

/** Maps a failed `/admin/auth/login` {@link ApiError} to one of the strings shown in the step-1 alert. */
function credentialsErrorMessage(error: ApiError): string {
  switch (error.type) {
    case 'account-locked':
      return en.errors.accountLocked;
    case 'email-not-verified':
      return en.errors.emailNotVerified;
    case 'account-disabled':
      return en.errors.accountDisabled;
    default:
      // 'unauthenticated' (wrong email/password) and anything unexpected: one generic message,
      // BR-AU-03 — never reveal whether the email or the password was wrong.
      return en.admin.login.genericError;
  }
}

/**
 * Step 1: email + password. Real RHF + Zod form (`adminLoginSchema`); on success hands the
 * `mfaToken` up to the parent state machine.
 */
function CredentialsStep({ onSuccess }: { onSuccess: (mfaToken: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AdminLoginInput>({ resolver: zodResolver(adminLoginSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const response = await adminLogin(values);
      onSuccess(response.mfaToken);
    } catch (err) {
      setError(credentialsErrorMessage(err as ApiError));
    }
  });

  return (
    <>
      <h1 className="h3 mb-1">{en.admin.login.title}</h1>
      <p className="text-body-secondary mb-4">{en.admin.login.subtitle}</p>
      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}
      <form onSubmit={onSubmit} noValidate>
        <div className="mb-3">
          <label htmlFor="admin-email" className="form-label">
            {en.admin.login.email}
          </label>
          <input
            id="admin-email"
            type="email"
            className={`form-control${errors.email ? ' is-invalid' : ''}`}
            autoComplete="username"
            aria-describedby={errors.email ? 'admin-email-error' : undefined}
            {...register('email')}
          />
          {errors.email && (
            <div id="admin-email-error" className="invalid-feedback">
              {errors.email.message}
            </div>
          )}
        </div>
        <div className="mb-3">
          <label htmlFor="admin-password" className="form-label">
            {en.admin.login.password}
          </label>
          <input
            id="admin-password"
            type="password"
            className={`form-control${errors.password ? ' is-invalid' : ''}`}
            autoComplete="current-password"
            aria-describedby={errors.password ? 'admin-password-error' : undefined}
            {...register('password')}
          />
          {errors.password && (
            <div id="admin-password-error" className="invalid-feedback">
              {errors.password.message}
            </div>
          )}
        </div>
        <button type="submit" className="btn btn-primary w-100" disabled={isSubmitting} aria-busy={isSubmitting}>
          {isSubmitting && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />}
          {isSubmitting ? en.admin.login.submitting : en.admin.login.submit}
        </button>
      </form>
      <p className="mt-3 mb-0">
        <Link to="/">{en.admin.login.backToSiteLink}</Link>
      </p>
    </>
  );
}

/** Regex a plain 6-digit TOTP code must match (server re-validates regardless). */
const TOTP_CODE_PATTERN = /^\d{6}$/;

/**
 * The generic retry message shown for any step-2 failure this component itself handles
 * ('mfa-invalid' or anything unexpected — never distinguishing reasons). A dead/expired
 * `mfaToken` ('unauthenticated') is handled separately by the parent, sending the admin back
 * to step 1 instead.
 */
const MFA_GENERIC_ERROR = en.admin.mfa.genericError;

/**
 * Step 2: the regular TOTP/recovery-code challenge for an already-enrolled admin. Reports the
 * session response up so the parent can finish sign-in.
 */
function MfaStep({
  mfaToken,
  onSuccess,
  onExpired,
}: {
  mfaToken: string;
  onSuccess: (response: AdminMfaVerifyResponse) => void;
  onExpired: () => void;
}) {
  const [mode, setMode] = useState<'code' | 'recovery'>('code');
  const [code, setCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const codeValid = TOTP_CODE_PATTERN.test(code);
  const canSubmit = mode === 'code' ? codeValid : recoveryCode.trim().length > 0;

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit || isSubmitting) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const response =
        mode === 'code'
          ? await adminMfaVerify({ mfaToken, code })
          : await adminMfaVerify({ mfaToken, recoveryCode: recoveryCode.trim() });
      onSuccess(response);
    } catch (err) {
      const apiError = err as ApiError;
      if (apiError.type === 'unauthenticated') {
        onExpired();
        return;
      }
      setError(MFA_GENERIC_ERROR);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <h1 className="h4 mb-3">{en.admin.mfa.title}</h1>
      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}
      <form onSubmit={onSubmit} noValidate>
        {mode === 'code' ? (
          <div className="mb-3">
            <label htmlFor="admin-mfa-code" className="form-label">
              {en.admin.mfa.codeLabel}
            </label>
            <input
              id="admin-mfa-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className="form-control"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
          </div>
        ) : (
          <div className="mb-3">
            <label htmlFor="admin-mfa-recovery" className="form-label">
              {en.admin.mfa.recoveryCodeLabel}
            </label>
            <input
              id="admin-mfa-recovery"
              type="text"
              autoComplete="off"
              className="form-control"
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value)}
            />
          </div>
        )}
        <button
          type="submit"
          className="btn btn-primary w-100"
          disabled={!canSubmit || isSubmitting}
          aria-busy={isSubmitting}
        >
          {isSubmitting && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />}
          {isSubmitting ? en.admin.mfa.submitting : en.admin.mfa.submit}
        </button>
      </form>
      <button
        type="button"
        className="btn btn-link px-0 mt-2"
        onClick={() => {
          setError(null);
          setMode((m) => (m === 'code' ? 'recovery' : 'code'));
        }}
      >
        {mode === 'code' ? en.admin.mfa.useRecoveryCode : en.admin.mfa.useAuthenticatorCode}
      </button>
    </>
  );
}

/**
 * Standalone admin login page at `/admin/login`. Owns the 2-step (password then MFA) sign-in
 * state machine and, on success, bootstraps the session (`setAccessToken` + `useAuth().setUser`)
 * before navigating to `/admin`.
 */
export default function AdminLoginPage() {
  const [step, setStep] = useState<Step>('credentials');
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [expiredNotice, setExpiredNotice] = useState(false);
  const { setUser } = useAuth();
  const navigate = useNavigate();

  // Bootstraps the authenticated session: in-memory token store first, then the shared auth
  // context's user, mirroring `AuthContext.login`'s own ordering.
  const finishSession = (response: AdminMfaVerifyResponse) => {
    setAccessToken(response.accessToken);
    setUser(response.user);
    navigate('/admin', { replace: true });
  };

  const handleCredentialsSuccess = (token: string) => {
    setExpiredNotice(false);
    setMfaToken(token);
    setStep('mfa');
  };

  const handleMfaExpired = () => {
    setMfaToken(null);
    setExpiredNotice(true);
    setStep('credentials');
  };

  return (
    <div className="mx-auto" style={{ maxWidth: 420 }}>
      {expiredNotice && step === 'credentials' && (
        <div className="alert alert-warning" role="alert">
          {en.errors.unauthenticated}
        </div>
      )}
      {step === 'credentials' && <CredentialsStep onSuccess={handleCredentialsSuccess} />}
      {step === 'mfa' && mfaToken && (
        <MfaStep mfaToken={mfaToken} onSuccess={finishSession} onExpired={handleMfaExpired} />
      )}
    </div>
  );
}
