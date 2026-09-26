import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";

import { getStudentBreadcrumbs } from "@/app/routes";
import { useAuth } from "@/app/AuthProvider";
import Breadcrumbs from "@/components/common/Breadcrumbs";
import NotificationBell from "@/components/notifications/NotificationBell";
import ThemeControls from "@/layouts/ThemeControls";
import { en } from "@/content/en";

export default function StudentLayout() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const breadcrumbs = getStudentBreadcrumbs(location.pathname);

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
              <li>
                <Link to={en.routes.reports}>{en.layout.studentNav.reports}</Link>
              </li>
              <li>{en.layout.studentNav.settings}</li>
            </ul>
          </nav>
        </aside>

        <main id="main-content" className="main-content">
          <Breadcrumbs items={breadcrumbs} ariaLabel={en.layout.breadcrumbAriaLabel} />
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
        <Link to={en.routes.reports} className="bottom-nav__item">
          {en.layout.studentNav.reports}
        </Link>
        <button type="button" className="bottom-nav__item">
          {en.layout.studentNav.settings}
        </button>
      </nav>

      <button
        type="button"
        className="fab-action"
        aria-label={en.layout.quickAddAriaLabel}
        onClick={() => {
          if (location.pathname === en.routes.transactions) {
            navigate(`${en.routes.transactions}?new=1`, { replace: true });
            return;
          }

          navigate(`${en.routes.transactions}?new=1`);
        }}
      >
        +
      </button>
    </div>
  );
}
