import { Link } from "react-router-dom";

import { en } from "@/content/en";

export default function NotFoundPage() {
  return (
    <main className="status-page" aria-labelledby="not-found-title">
      <p className="status-page__code">404</p>
      <h1 id="not-found-title">{en.notFound.title}</h1>
      <p>{en.notFound.detail}</p>
      <Link className="btn btn-primary" to={en.routes.login}>
        {en.notFound.backAction}
      </Link>
    </main>
  );
}
