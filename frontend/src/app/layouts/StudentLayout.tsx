/**
 * StudentLayout.tsx
 * Shell for the student area (`/app/*`): full sidebar at `>=lg`, icon-only sidebar at `md`,
 * bottom nav (5 items) + a floating "+" quick-add button at `<sm` (spec §8.4 breakpoints).
 * Hosts the notification bell (desktop toolbar + mobile top bar, so unread count is visible at
 * every breakpoint) and the active-announcements banner above the page content.
 * Wraps its `<Outlet/>` in one `ErrorBoundary`, renders `Breadcrumbs` above the page content.
 * Also mounts `TawkWidget` (no-op without `VITE_TAWK_PROPERTY_ID`).
 * Exports: StudentLayout
 * Spec: docs/spec/08 §8.4 (student shell + responsive nav) · docs/diagrams/fig25.jpg (sitemap)
 */
import { Link, NavLink, Outlet } from 'react-router';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { FontSizeControl } from '../../components/FontSizeControl';
import { OfflineBanner } from '../../components/OfflineBanner';
import { SkipToContent } from '../../components/SkipToContent';
import { TawkWidget } from '../../components/TawkWidget';
import { ThemeToggle } from '../../components/ThemeToggle';
import { AnnouncementsBanner } from '../../features/announcements/components/AnnouncementsBanner';
import { NotificationBell } from '../../features/notifications/components/NotificationBell';
import { QuickAddProvider, useQuickAdd } from '../../features/transactions/components/QuickAddContext';
import { en } from '../../i18n/en';
import { useAuth } from '../../lib/auth/AuthContext';

interface NavItem {
  to: string;
  label: string;
  icon: string;
  /** Only these appear in the `<sm` bottom nav (kept to 5, per spec). */
  inBottomNav?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/app', label: en.nav.dashboard, icon: 'bi-house', inBottomNav: true },
  { to: '/app/transactions', label: en.nav.transactions, icon: 'bi-arrow-left-right', inBottomNav: true },
  { to: '/app/transactions/recurring', label: en.nav.recurring, icon: 'bi-arrow-repeat' },
  { to: '/app/transactions/import', label: en.nav.importCsv, icon: 'bi-upload' },
  { to: '/app/transactions/trash', label: en.nav.trash, icon: 'bi-trash' },
  { to: '/app/saved', label: en.nav.saved, icon: 'bi-bookmark' },
  { to: '/app/budgets', label: en.nav.budgets, icon: 'bi-wallet2', inBottomNav: true },
  { to: '/app/categories', label: en.nav.categories, icon: 'bi-tags' },
  { to: '/app/reports', label: en.nav.reports, icon: 'bi-bar-chart', inBottomNav: true },
  { to: '/app/insights', label: en.nav.insights, icon: 'bi-stars' },
  { to: '/app/tips', label: en.nav.tips, icon: 'bi-piggy-bank' },
  { to: '/app/profile', label: en.nav.profile, icon: 'bi-person-gear', inBottomNav: true },
];

const BOTTOM_NAV_ITEMS = NAV_ITEMS.filter((item) => item.inBottomNav);

/** Shell for the authenticated student area (`/app/*`); mounts the quick-add modal + shortcut once. */
export function StudentLayout() {
  return (
    <QuickAddProvider>
      <StudentLayoutBody />
    </QuickAddProvider>
  );
}

function StudentLayoutBody() {
  const { user, logout } = useAuth();
  const { open: openQuickAdd } = useQuickAdd();

  return (
    <div className="d-flex min-vh-100">
      <SkipToContent />
      <TawkWidget />
      {/* Sidebar: full labels >=lg (`.cc-sidebar` widens in _tokens.scss), icon-only at md,
          hidden below md (bottom nav takes over). */}
      <aside className="cc-sidebar d-none d-md-flex flex-column border-end p-2 p-lg-3">
        <Link to="/app" className="navbar-brand d-flex align-items-center gap-2 px-2 py-2 fw-semibold">
          <i className="bi bi-coin text-bc-accent" aria-hidden="true" />
          <span className="d-none d-lg-inline">{en.app.name}</span>
        </Link>
        <nav aria-label={en.layout.menu} className="flex-grow-1">
          <ul className="nav nav-pills flex-column gap-1">
            {NAV_ITEMS.map((item) => (
              <li key={item.to} className="nav-item">
                <NavLink
                  to={item.to}
                  end={item.to === '/app'}
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
          onClick={() => void logout()}
        >
          <i className="bi bi-box-arrow-right" aria-hidden="true" />
          <span className="d-none d-lg-inline">{en.nav.logOut}</span>
        </button>
      </aside>

      <div className="d-flex flex-column flex-grow-1 min-vw-0">
        <OfflineBanner />
        <header className="d-flex d-md-none align-items-center justify-content-between border-bottom p-2">
          <Link to="/app" className="navbar-brand d-flex align-items-center gap-2 fw-semibold mb-0">
            <i className="bi bi-coin text-bc-accent" aria-hidden="true" />
            {en.app.name}
          </Link>
          <div className="d-flex align-items-center gap-2">
            <NotificationBell />
            <ThemeToggle />
          </div>
        </header>
        <div className="d-none d-md-flex align-items-center justify-content-end gap-2 p-2 border-bottom">
          <button type="button" className="btn btn-primary btn-sm" onClick={openQuickAdd}>
            <i className="bi bi-plus-lg me-1" aria-hidden="true" />
            {en.transactions.quickAddButton}
          </button>
          <NotificationBell />
          <FontSizeControl />
          <ThemeToggle />
          {user ? <span className="small text-body-secondary align-self-center">{user.fullName}</span> : null}
        </div>

        <main id="main-content" className="flex-grow-1 container-fluid py-3 pb-5 pb-md-3">
          <Breadcrumbs />
          <AnnouncementsBanner />
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>

        {/* Bottom nav + floating quick-add, <sm only. */}
        <nav
          aria-label={en.layout.menu}
          className="d-flex d-sm-none border-top bg-body position-fixed bottom-0 start-0 end-0"
          style={{ zIndex: 1030 }}
        >
          {BOTTOM_NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/app'}
              className={({ isActive }) =>
                `flex-fill text-center py-2 small text-decoration-none${isActive ? ' text-primary' : ' text-body-secondary'}`
              }
            >
              <i className={`bi ${item.icon} d-block fs-5`} aria-hidden="true" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button
          type="button"
          onClick={openQuickAdd}
          className="d-sm-none btn btn-primary rounded-circle position-fixed d-flex align-items-center justify-content-center"
          style={{ width: '3.5rem', height: '3.5rem', right: '1rem', bottom: '4.5rem', zIndex: 1031 }}
          aria-label={en.layout.quickAdd}
          title={en.layout.quickAdd}
        >
          <i className="bi bi-plus-lg fs-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
