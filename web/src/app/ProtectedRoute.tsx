import type { AuthRole } from "@campus-coin/shared";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { en } from "@/content/en";
import { useAuth } from "@/app/AuthProvider";

type ProtectedRouteProps = {
  allow: AuthRole[];
};

export default function ProtectedRoute({ allow }: ProtectedRouteProps) {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return <p>{en.common.loadingLabel}</p>;
  }

  const isAdminRoute = allow.includes("admin");
  const loginPath = isAdminRoute ? en.routes.adminLogin : en.routes.login;

  if (!user) {
    return <Navigate to={loginPath} replace state={{ from: location.pathname }} />;
  }

  if (!allow.includes(user.role)) {
    return <Navigate to={loginPath} replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
