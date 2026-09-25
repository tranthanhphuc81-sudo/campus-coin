import { Link, Outlet } from "react-router-dom";

import { useAuth } from "@/app/AuthProvider";
import ThemeControls from "@/layouts/ThemeControls";
import { en } from "@/content/en";

export default function AdminLayout() {
  const { signOut } = useAuth();

  return (
    <div className="layout-shell">
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

      <main id="main-content" className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
