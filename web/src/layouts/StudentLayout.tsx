import { Link, Outlet } from "react-router-dom";

import { useAuth } from "@/app/AuthProvider";
import NotificationBell from "@/components/notifications/NotificationBell";
import ThemeControls from "@/layouts/ThemeControls";
import { en } from "@/content/en";

export default function StudentLayout() {
  const { signOut } = useAuth();

  return (
    <div className="layout-shell student-layout">
      <header className="topbar">
        <Link to={en.routes.home} className="brand-link">
          {en.appName}
        </Link>
        <div className="topbar-actions">
          <NotificationBell />
          <ThemeControls />
          <button type="button" className="btn btn-outline" onClick={() => void signOut()}>
            {en.auth.home.signOutLabel}
          </button>
        </div>
      </header>

      <div className="page-grid">
        <aside className="side-nav" aria-label={en.layout.studentSideNavAriaLabel}>
          <nav>
            <ul>
              <li>
                <Link to={en.routes.home}>{en.layout.studentNav.dashboard}</Link>
              </li>
              <li>
                <Link to={en.routes.manageCategories}>{en.layout.studentNav.categories}</Link>
              </li>
              <li>
                <Link to={en.routes.transactions}>{en.layout.studentNav.transactions}</Link>
              </li>
              <li>
                <Link to={en.routes.budgets}>{en.layout.studentNav.budgets}</Link>
              </li>
              <li>{en.layout.studentNav.reports}</li>
              <li>{en.layout.studentNav.settings}</li>
            </ul>
          </nav>
        </aside>

        <main id="main-content" className="main-content">
          <Outlet />
        </main>
      </div>

      <nav className="bottom-nav" aria-label={en.layout.studentBottomNavAriaLabel}>
        <Link to={en.routes.home} className="bottom-nav__item">
          {en.layout.studentNav.dashboard}
        </Link>
        <Link to={en.routes.manageCategories} className="bottom-nav__item">
          {en.layout.studentNav.categories}
        </Link>
        <Link to={en.routes.transactions} className="bottom-nav__item">
          {en.layout.studentNav.transactions}
        </Link>
        <Link to={en.routes.budgets} className="bottom-nav__item">
          {en.layout.studentNav.budgets}
        </Link>
        <button type="button" className="bottom-nav__item">
          {en.layout.studentNav.reports}
        </button>
        <button type="button" className="bottom-nav__item">
          {en.layout.studentNav.settings}
        </button>
      </nav>

      <button type="button" className="fab-action" aria-label={en.layout.quickAddAriaLabel}>
        +
      </button>
    </div>
  );
}
