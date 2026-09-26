import { Link, Outlet, useLocation } from "react-router-dom";

import ThemeControls from "@/layouts/ThemeControls";
import { en } from "@/content/en";
import TawkWidget from "@/components/common/TawkWidget";

export default function PublicLayout() {
  const location = useLocation();
  const isWidePage =
    location.pathname === en.routes.home || location.pathname === en.routes.sitemap;
  const isAdminPage = location.pathname.startsWith("/admin");

  return (
    <div className="layout-shell">
      <header className="topbar">
        <Link to={en.routes.home} className="brand-link">
          {en.appName}
        </Link>
        <ThemeControls />
      </header>

      <main
        id="main-content"
        className={`main-content${isWidePage ? " public-main-content" : " main-content--narrow"}`}
      >
        <Outlet />
      </main>
      {!isAdminPage ? <TawkWidget /> : null}
    </div>
  );
}
