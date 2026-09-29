/**
 * ProtectedRoute.tsx
 * Route guard: renders its nested `<Outlet/>` only when the user is authenticated AND has an
 * allowed role; otherwise redirects (preserving the attempted location in router state). While
 * the initial session bootstrap is still running, shows a full-page loading skeleton instead of
 * redirecting prematurely.
 * Exports: ProtectedRoute
 * Spec: docs/spec/09 §9.6 (role-based access)
 */
import type { Role } from '@campuscoin/shared';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../../lib/auth/AuthContext';

interface ProtectedRouteProps {
  /** Roles allowed past this guard. */
  allow: Role[];
  /** Redirect target when unauthenticated or the role does not match. */
  redirectTo: string;
}

/** Full-page skeleton shown while the initial session refresh is in flight. */
function BootstrapSkeleton() {
  return (
    <div className="container py-5" role="status" aria-live="polite">
      <span className="visually-hidden">Loading…</span>
      <div className="placeholder-glow" aria-hidden="true">
        <span className="placeholder col-4 mb-3 d-block" />
        <span className="placeholder col-12 mb-2 d-block" />
        <span className="placeholder col-8 d-block" />
      </div>
    </div>
  );
}

/** Guards a subtree of routes by authentication + role (see {@link ProtectedRouteProps}). */
export function ProtectedRoute({ allow, redirectTo }: ProtectedRouteProps) {
  const { user, isBootstrapping } = useAuth();
  const location = useLocation();

  if (isBootstrapping) return <BootstrapSkeleton />;
  if (!user || !allow.includes(user.role)) {
    return <Navigate to={redirectTo} replace state={{ from: location }} />;
  }
  return <Outlet />;
}
