/**
 * Breadcrumbs.tsx
 * "Home › X › Y" trail built from the active route matches' `handle.breadcrumb` (set on each
 * route in `app/router.tsx`). The current page is rendered as plain text, never a link.
 * Exports: Breadcrumbs
 * Spec: docs/spec/08 §8.3 (navigation)
 */
import { Link, useMatches } from 'react-router';
import { en } from '../i18n/en';

/** Shape a route's `handle` must have to appear in the trail. */
interface BreadcrumbHandle {
  breadcrumb?: string;
}

/** Renders the current route's breadcrumb trail as a Bootstrap `<nav><ol>`. */
export function Breadcrumbs() {
  const matches = useMatches();
  const crumbs = matches
    .filter((match) => Boolean((match.handle as BreadcrumbHandle | undefined)?.breadcrumb))
    .map((match) => ({
      label: (match.handle as BreadcrumbHandle).breadcrumb as string,
      pathname: match.pathname,
    }));

  if (crumbs.length === 0) return null;

  return (
    <nav aria-label={en.breadcrumbs.label} className="mb-3">
      <ol className="breadcrumb mb-0">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <li
              key={crumb.pathname}
              className={`breadcrumb-item${isLast ? ' active' : ''}`}
              aria-current={isLast ? 'page' : undefined}
            >
              {isLast ? crumb.label : <Link to={crumb.pathname}>{crumb.label}</Link>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
