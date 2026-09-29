/**
 * PublicLayout.tsx
 * Shell for public (unauthenticated) routes: simple navbar (logo, nav links, theme toggle) +
 * footer. Wraps its `<Outlet/>` in one `ErrorBoundary` so one crashing page never blanks the
 * whole app, and renders `Breadcrumbs` above the page content. Also mounts `TawkWidget` (no-op
 * without `VITE_TAWK_PROPERTY_ID`; hides itself on `/admin*`, e.g. `/admin/login` reuses this shell).
 * Exports: PublicLayout
 * Spec: docs/spec/08 §8.2 (public shell)
 */
import { Link, Outlet } from 'react-router';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { OfflineBanner } from '../../components/OfflineBanner';
import { SkipToContent } from '../../components/SkipToContent';
import { TawkWidget } from '../../components/TawkWidget';
import { ThemeToggle } from '../../components/ThemeToggle';
import { en } from '../../i18n/en';

/** Shell for public marketing/auth pages (landing, features, login, register, …). */
export function PublicLayout() {
  return (
    <div className="d-flex flex-column min-vh-100">
      <SkipToContent />
      <TawkWidget />
      <OfflineBanner />
      <nav className="navbar navbar-expand-md border-bottom" aria-label={en.app.name}>
        <div className="container">
          <Link className="navbar-brand fw-semibold d-flex align-items-center gap-2" to="/">
            <i className="bi bi-coin text-bc-accent" aria-hidden="true" />
            {en.app.name}
          </Link>
          <div className="d-flex align-items-center gap-3">
            <Link to="/features" className="nav-link d-none d-sm-inline">
              {en.nav.features}
            </Link>
            <Link to="/login" className="nav-link d-none d-sm-inline">
              {en.nav.login}
            </Link>
            <Link to="/register" className="btn btn-primary btn-sm">
              {en.nav.register}
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </nav>
      <main id="main-content" className="flex-grow-1 container py-4">
        <Breadcrumbs />
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
      <footer className="border-top py-3 mt-auto">
        <div className="container d-flex flex-wrap justify-content-between gap-2 text-body-secondary small">
          <span>
            © {new Date().getFullYear()} {en.app.name}
          </span>
          <div className="d-flex gap-3">
            <Link to="/sitemap">{en.layout.footerSitemap}</Link>
            <Link to="/help">{en.layout.footerHelp}</Link>
            {/* Not in scope for this phase; routed to the catch-all 404 until built. */}
            <Link to="/privacy">{en.layout.footerPrivacy}</Link>
            <Link to="/terms">{en.layout.footerTerms}</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
