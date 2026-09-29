/**
 * NotFoundPage.tsx
 * Catch-all 404 page rendered inside `PublicLayout` for any unmatched route.
 * Exports: default (NotFoundPage)
 */
import { Link } from 'react-router';
import { en } from '../../../i18n/en';

/** Generic "page not found" screen. */
export default function NotFoundPage() {
  return (
    <div className="text-center py-5">
      <i className="bi bi-signpost-2 display-3 text-body-secondary" aria-hidden="true" />
      <h1 className="mt-3">{en.notFound.title}</h1>
      <p className="text-body-secondary">{en.notFound.body}</p>
      <Link to="/" className="btn btn-primary mt-2">
        {en.notFound.backHome}
      </Link>
    </div>
  );
}
