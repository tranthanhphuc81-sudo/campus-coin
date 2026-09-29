/**
 * VerifyEmailPage.tsx
 * Public "verify email" landing page (`/verify-email?token=...`). Fires `POST /auth/verify-email`
 * once on mount (guarded against React's dev-mode double-invoke) and renders one of four states:
 * missing token, verifying, success, failure. Never distinguishes *why* a token failed
 * (malformed/unknown/used/expired) — that is the backend's `invalid-token` contract.
 *
 * Security hardening (C-H1, docs/security/review-p19.md): the token is a live, still-usable
 * secret (24 h TTL) — it is read into state once on mount and then immediately stripped from the
 * visible URL/history via `history.replaceState`, so it can't leak through a same-page
 * third-party script (Tawk.to reporting `location.href`), browser history sync, or anything else
 * inspecting the URL later in the session. `TawkWidget` also denylists this route as a second,
 * independent layer of defence.
 * Exports: default (VerifyEmailPage)
 * Spec: docs/spec/09 §9 (auth) · docs/security/review-p19.md (C-H1)
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { PageHeader } from '../../../components/PageHeader';
import { en } from '../../../i18n/en';
import { apiClient } from '../../../lib/apiClient/apiClient';

type VerifyStatus = 'pending' | 'success' | 'failure';

/** Public email-verification landing page reached from the link sent by `/auth/register`. */
export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  // Captured once, at mount, before `history.replaceState` below removes it from the URL.
  const [token] = useState(() => searchParams.get('token'));
  const [status, setStatus] = useState<VerifyStatus>('pending');
  const fired = useRef(false);

  useEffect(() => {
    if (!token) return;
    // BR (security, C-H1): strip the token from the visible URL right after it's captured into
    // state — `replaceState` (not `pushState`) so it doesn't add a back/forward history entry.
    window.history.replaceState(null, '', window.location.pathname);
  }, [token]);

  useEffect(() => {
    if (!token || fired.current) return;
    fired.current = true;

    (async () => {
      try {
        await apiClient.post('/auth/verify-email', { token });
        setStatus('success');
      } catch {
        setStatus('failure');
      }
    })();
  }, [token]);

  if (!token) {
    return (
      <>
        <PageHeader title={en.auth.verifyEmail.title} />
        <p>{en.auth.verifyEmail.missingToken}</p>
        <Link to="/resend-verification">{en.auth.verifyEmail.resendLink}</Link>
      </>
    );
  }

  if (status === 'pending') {
    return (
      <>
        <PageHeader title={en.auth.verifyEmail.title} />
        <p role="status" aria-live="polite">
          <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
          {en.auth.verifyEmail.verifying}
        </p>
      </>
    );
  }

  if (status === 'success') {
    return (
      <>
        <PageHeader title={en.auth.verifyEmail.successTitle} />
        <p>{en.auth.verifyEmail.success}</p>
        <Link to="/login">{en.auth.verifyEmail.logInLink}</Link>
      </>
    );
  }

  return (
    <>
      <PageHeader title={en.auth.verifyEmail.failureTitle} />
      <p>{en.auth.verifyEmail.failure}</p>
      <Link to="/resend-verification">{en.auth.verifyEmail.resendLink}</Link>
    </>
  );
}
