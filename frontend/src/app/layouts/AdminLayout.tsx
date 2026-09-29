/**
 * AdminLayout.tsx
 * Shell for the admin portal (`/admin/*`): its own sidebar, an environment banner, and a
 * 30-minute inactivity auto-logout (`ADMIN_IDLE_TIMEOUT_MS`) — tracks `mousedown`/`keydown`/
 * `scroll` and resets a single timer; firing logs the admin out and redirects to `/admin/login`.
 * Wraps its `<Outlet/>` in one `ErrorBoundary`, renders `Breadcrumbs` above the page content.
 * Exports: AdminLayout
 * Spec: docs/spec/08 §8.4 (admin shell) · Rules: BR admin idle timeout (PROGRESS.md P05 note)
 */
import { ADMIN_IDLE_TIMEOUT_MS } from '@campuscoin/shared';
import { useEffect, useRef } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { OfflineBanner } from '../../components/OfflineBanner';
import { SkipToContent } from '../../components/SkipToContent';
import { ThemeToggle } from '../../components/ThemeToggle';
import { useToast } from '../../components/ToastProvider';
import { en } from '../../i18n/en';
import { useAuth } from '../../lib/auth/AuthContext';

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll'] as const;

const NAV_ITEMS = [
  { to: '/admin', label: en.nav.dashboard, icon: 'bi-speedometer2' },
  { to: '/admin/users', label: en.nav.adminUsers, icon: 'bi-people' },
  { to: '/admin/categories', label: en.nav.adminCategories, icon: 'bi-tags' },
  { to: '/admin/tip-templates', label: en.nav.adminTipTemplates, icon: 'bi-lightbulb' },
  { to: '/admin/notifications', label: en.nav.adminNotifications, icon: 'bi-megaphone' },
  { to: '/admin/stats', label: en.nav.adminStats, icon: 'bi-bar-chart' },
  { to: '/admin/audit-log', label: en.nav.adminAuditLog, icon: 'bi-journal-text' },
];

/** Best-effort dev/prod label for the environment banner (never a secret, safe to show). */
function currentEnvironment(): string {
  return import.meta.env.MODE ?? 'development';
}

/** Shell for the admin portal (`/admin/*`), including the mandatory idle-timeout logout. */
export function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    function resetTimer() {
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        void logout().finally(() => {
          showToast({ message: en.admin.idleLoggedOut });
          navigate('/admin/login', { replace: true });
        });
      }, ADMIN_IDLE_TIMEOUT_MS);
    }

    resetTimer();
    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, resetTimer, { passive: true });
    }
    return () => {
      window.clearTimeout(timerRef.current);
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, resetTimer);
      }
    };
  }, [logout, navigate, showToast]);

  return (
    <div className="d-flex min-vh-100">
      <SkipToContent />
      <aside className="cc-sidebar d-none d-md-flex flex-column border-end p-2 p-lg-3">
        <Link to="/admin" className="navbar-brand d-flex align-items-center gap-2 px-2 py-2 fw-semibold">
          <i className="bi bi-shield-lock text-bc-accent" aria-hidden="true" />
          <span className="d-none d-lg-inline">{en.app.name}</span>
        </Link>
        <nav aria-label={en.layout.menu} className="flex-grow-1">
          <ul className="nav nav-pills flex-column gap-1">
            {NAV_ITEMS.map((item) => (
              <li key={item.to} className="nav-item">
                <NavLink
                  to={item.to}
                  end={item.to === '/admin'}
                  className={({ isActive }) => `nav-link d-flex align-items-center gap-2${isActive ? ' active' : ''}`}
                  title={item.label}
                >
                  <i className={`bi ${item.icon}`} aria-hidden="true" />
                  <span className="d-none d-lg-inline">{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <button
          type="button"
          className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-2 mt-2"
          onClick={() => void logout().then(() => navigate('/admin/login', { replace: true }))}
        >
          <i className="bi bi-box-arrow-right" aria-hidden="true" />
          <span className="d-none d-lg-inline">{en.nav.logOut}</span>
        </button>
      </aside>

      <div className="d-flex flex-column flex-grow-1 min-vw-0">
        <OfflineBanner />
        <div className="bg-warning-subtle text-center py-1 small fw-semibold">
          {en.admin.envBanner(currentEnvironment())}
        </div>
        <div className="d-flex justify-content-between align-items-center gap-2 p-2 border-bottom">
          <span className="fw-semibold d-md-none">{en.app.name}</span>
          <div className="d-flex align-items-center gap-2 ms-auto">
            <ThemeToggle />
            {user ? <span className="small text-body-secondary">{user.fullName}</span> : null}
          </div>
        </div>

        <main id="main-content" className="flex-grow-1 container-fluid py-3">
          <Breadcrumbs />
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
