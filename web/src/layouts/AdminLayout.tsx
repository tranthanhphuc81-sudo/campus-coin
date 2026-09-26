import { Link, Outlet } from "react-router-dom";

import { useAuth } from "@/app/AuthProvider";
import ThemeControls from "@/layouts/ThemeControls";
import { en } from "@/content/en";

export default function AdminLayout() {
  const { signOut } = useAuth();

  return (
    <div className="layout-shell student-layout">
      <header className="topbar">
        <Link to={en.routes.adminHome} className="brand-link">
          {en.appName} Admin
        </Link>
        <div className="topbar-actions">
          <ThemeControls />
          <button type="button" className="btn btn-outline" onClick={() => void signOut()}>
            {en.auth.home.signOutLabel}
          </button>
        </div>
      </header>

      <div className="page-grid">
        <aside className="side-nav" aria-label={en.layout.adminSideNavAriaLabel}>
          <nav>
            <ul>
              <li>
                <Link to={en.routes.adminHome}>{en.layout.adminNav.dashboard}</Link>
              </li>
              <li>
                <Link to={en.routes.adminUsers}>{en.layout.adminNav.users}</Link>
              </li>
              <li>
                <Link to={en.routes.adminDefaultCategories}>{en.layout.adminNav.categories}</Link>
              </li>
              <li>
                <Link to={en.routes.adminTipTemplates}>{en.layout.adminNav.tipTemplates}</Link>
              </li>
              <li>
                <Link to={en.routes.adminAnnouncements}>{en.layout.adminNav.announcements}</Link>
              </li>
              <li>
                <Link to={en.routes.adminAuditLogs}>{en.layout.adminNav.auditLogs}</Link>
              </li>
            </ul>
          </nav>
        </aside>

        <main id="main-content" className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
