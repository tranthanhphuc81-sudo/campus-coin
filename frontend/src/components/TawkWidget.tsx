/**
 * TawkWidget.tsx
 * Loads the Tawk.to live-chat widget (docs/spec/03 §3.4, docs/spec/09 §9.11 — CSP already allows
 * `embed.tawk.to`/`*.tawk.to` in `backend/src/middlewares/security.ts`) once the page has finished
 * loading, and never on `TAWK_DENYLISTED_ROUTES` (the admin portal plus every auth page). Renders
 * nothing when `VITE_TAWK_PROPERTY_ID` is not configured — the whole app must work with no chatbot
 * configured, mirroring this project's "AI_API_KEY empty" fallback philosophy.
 *
 * Security hardening (C-H1 / C-M1, docs/security/review-p19.md): `/reset-password?token=…`
 * (30 min TTL) and `/verify-email?token=…` (24 h TTL) carry a live, still-usable secret token in
 * `location.href`. Tawk's embed reports the visitor's current page URL to Tawk's own servers as
 * part of normal chat-widget behaviour, so a compromised/malicious Tawk script (or dashboard
 * access) would get a working account-takeover link. `/login`, `/register` and
 * `/forgot-password` are denylisted too (C-M1) to shrink the same-origin surface a resident
 * third-party script has over the credential/session-refresh flow. The token pages also strip
 * their token from the URL themselves (see `ResetPasswordPage`/`VerifyEmailPage`) as a second,
 * independent layer of defence.
 *
 * Security hardening (admin portal): `Tawk_API.hideWidget()` only hides the embed's UI — it does
 * NOT unload the `embed.tawk.to` script or tear down its JS execution context. The admin portal
 * handles a bearer token and MFA codes, so a same-origin third-party script staying resident
 * (even hidden) there is a real risk: a compromised script could hook `fetch`/`XMLHttpRequest` and
 * read the admin's token as they interact with the page. `/admin/login` reuses `PublicLayout`
 * (so this component still mounts there); every other `/admin*` page uses `AdminLayout`, which
 * never mounts this component at all. So the one place this component can still observe an
 * "entering `/admin*` with the script already live" transition is right when the route becomes
 * `/admin/login`. When that happens, instead of merely hiding the widget, force a full browser
 * navigation (`window.location.assign`) so the whole JS context — and the script resident in it —
 * is torn down before the admin ever reaches the authenticated part of the portal. Landing
 * directly on an admin route on a fresh page load (script never injected) is unaffected.
 * Exports: TawkWidget
 * Spec: docs/spec/03 §3.4 · docs/spec/09 §9.11 · docs/security/review-p19.md (C-H1, C-M1)
 */
import { useEffect } from 'react';
import { useLocation } from 'react-router';

/** Only alphanumeric ids are ever interpolated into the Tawk script URL (defence in depth). */
const SAFE_ID_PATTERN = /^[a-z0-9]+$/i;

// BR (security, C-H1/C-M1): routes where the widget must never inject/show. `/admin` also covers
// every `/admin/*` sub-route (matched via `isUnderRoute` below); it gets an extra, stronger
// forced-reload treatment further down because it can stay in an authenticated session for a
// long time. The rest are single-purpose auth pages that either carry a live secret token in the
// URL (`reset-password`, `verify-email`) or handle credentials/session refresh
// (`login`, `register`, `forgot-password`).
const TAWK_DENYLISTED_ROUTES: readonly string[] = [
  '/admin',
  '/reset-password',
  '/verify-email',
  '/login',
  '/register',
  '/forgot-password',
];

/** True when `pathname` equals `route` or is a sub-route of it (e.g. `/admin/users` under `/admin`). */
function isUnderRoute(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

/** True when the current route must never show/inject the Tawk embed. */
function isDenylistedRoute(pathname: string): boolean {
  return TAWK_DENYLISTED_ROUTES.some((route) => isUnderRoute(pathname, route));
}

declare global {
  interface Window {
    Tawk_API?: {
      hideWidget?: () => void;
      showWidget?: () => void;
    };
  }
}

// Module-level (not component-state): the embed script must be injected at most once for the
// whole page, no matter how many times <TawkWidget/> mounts/unmounts while navigating between
// `PublicLayout` and `StudentLayout`.
let scriptInjected = false;

// Module-level guard so the forced-reload branch below fires at most once per script-injection
// lifetime — `window.location.assign` starts a real navigation (async), so without this guard a
// StrictMode double-effect or an extra re-render while still on the admin route could call it
// more than once. A real full-page navigation always resets this (and `scriptInjected`) back to
// `false` in the fresh JS context, so this can never cause a permanent "stuck" state.
let adminReloadTriggered = false;

/**
 * Mounts the Tawk.to embed script after the page finishes loading, toggles it hidden/visible as
 * the route enters/leaves a `TAWK_DENYLISTED_ROUTES` route, and does nothing at all when
 * unconfigured. Re-evaluates on every route change (SPA navigation), not just on initial mount, so
 * navigating into or out of a denylisted route always mounts/hides the widget correctly. If the
 * route becomes an admin route while the script is already injected, forces a full page reload
 * instead of just hiding the widget (see the security-hardening note above). Never forwards the
 * logged-in user's name/email to Tawk (`Tawk_API.setAttributes` is intentionally never called) —
 * the chat stays anonymous, per this app's privacy stance.
 */
export function TawkWidget() {
  // `search` is read from the router (not `window.location`) so the forced-reload target below
  // is correct under any router (incl. `MemoryRouter` in tests), matching real browser URLs when
  // the app runs under `BrowserRouter` (the router keeps `window.location` and its own state in
  // sync there).
  const { pathname, search } = useLocation();
  const propertyId = import.meta.env.VITE_TAWK_PROPERTY_ID ?? '';
  const widgetId = import.meta.env.VITE_TAWK_WIDGET_ID || 'default';
  const isConfigured = SAFE_ID_PATTERN.test(propertyId) && SAFE_ID_PATTERN.test(widgetId);

  useEffect(() => {
    if (!isConfigured) return undefined;
    const isAdminRoute = isUnderRoute(pathname, '/admin');

    if (isAdminRoute) {
      if (scriptInjected && !adminReloadTriggered) {
        // BR (security): the script is already live in this JS context (injected earlier while on
        // a public/student page) and the route just became an admin route via client-side
        // navigation — `hideWidget()` alone would leave it resident and able to observe the
        // admin's token. Force a full reload of the current URL to tear the whole context down.
        adminReloadTriggered = true;
        window.location.assign(`${pathname}${search}`);
        return undefined;
      }
      window.Tawk_API?.hideWidget?.();
      return undefined;
    }

    if (isDenylistedRoute(pathname)) {
      // BR (security, C-H1/C-M1): auth pages (reset-password/verify-email carry a live secret
      // token in the URL; login/register/forgot-password handle credentials). Never inject here;
      // if the script is already resident from an earlier public page, hide it rather than leaving
      // it visibly active. The token pages also strip their own token from the URL (defence in
      // depth — see `ResetPasswordPage`/`VerifyEmailPage`).
      window.Tawk_API?.hideWidget?.();
      return undefined;
    }

    if (scriptInjected) {
      window.Tawk_API?.showWidget?.();
      return undefined;
    }

    function inject() {
      if (scriptInjected) return;
      scriptInjected = true;
      const script = document.createElement('script');
      script.async = true;
      script.src = `https://embed.tawk.to/${propertyId}/${widgetId}`;
      script.charset = 'UTF-8';
      script.crossOrigin = '*';
      document.body.appendChild(script);
    }

    if (document.readyState === 'complete') {
      inject();
      return undefined;
    }
    window.addEventListener('load', inject, { once: true });
    return () => window.removeEventListener('load', inject);
  }, [pathname, search, isConfigured, propertyId, widgetId]);

  return null;
}
