import { Link, Outlet } from "react-router-dom";

import ThemeControls from "@/layouts/ThemeControls";
import { en } from "@/content/en";

export default function PublicLayout() {
  return (
    <div className="layout-shell">
      <header className="topbar">
        <Link to={en.routes.login} className="brand-link">
          {en.appName}
        </Link>
        <ThemeControls />
      </header>

      <main id="main-content" className="main-content main-content--narrow">
        <Outlet />
      </main>
    </div>
  );
}
