import { Link } from "react-router-dom";

import { adminRoutes, publicRoutes, studentRoutes } from "@/app/routes";
import { en } from "@/content/en";

export default function SitemapPage() {
  const routeGroups = [
    { key: "public", routes: publicRoutes },
    { key: "student", routes: studentRoutes },
    { key: "admin", routes: adminRoutes },
  ] as const;

  return (
    <section className="sitemap-page" aria-labelledby="sitemap-title">
      <header className="sitemap-page__header">
        <p className="landing-eyebrow">{en.appName}</p>
        <h1 id="sitemap-title">{en.sitemap.title}</h1>
        <p>{en.sitemap.subtitle}</p>
      </header>
      {routeGroups.map(({ key, routes }) => {
        const entries = routes.filter((route) => route.handle?.sitemap?.group === key);
        return (
          <section className="sitemap-group" key={key} aria-labelledby={`sitemap-${key}`}>
            <h2 id={`sitemap-${key}`}>{en.sitemap.groups[key]}</h2>
            <ul>
              {entries.map((route) => (
                <li key={route.path}>
                  <Link to={route.path}>{route.handle?.sitemap?.label}</Link>
                  <p>{route.handle?.sitemap?.description}</p>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <Link className="sitemap-back-link" to={en.routes.home}>
        {en.landing.sitemapBackAction}
      </Link>
    </section>
  );
}
