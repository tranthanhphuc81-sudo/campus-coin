/**
 * LandingPage.tsx
 * Public marketing home page (`/`): hero section with primary/secondary CTAs, a features
 * grid and a "how it works" walkthrough. Rendered inside `PublicLayout`, which already
 * provides the navbar and footer, so this page only renders its own content.
 * Exports: default (LandingPage)
 * Spec: docs/diagrams/fig25.jpg (sitemap) · docs/spec/08 (public pages)
 */
import { Link } from 'react-router';
import { en } from '../../../i18n/en';
import { useDocumentMeta } from '../../../lib/seo/useDocumentMeta';

/** Public landing page (root route): hero, features grid and "how it works" steps. */
export default function LandingPage() {
  useDocumentMeta({ title: en.app.name, description: en.landing.heroSubtitle });

  return (
    <div>
      <section className="text-center py-5">
        <i className="bi bi-coin display-3 text-bc-accent" aria-hidden="true" />
        {/* text-primary (not text-bc-accent): the accent gold is reserved for icons/highlights
            (spec §8.2) and fails WCAG contrast as small text on the light body background. */}
        <p className="text-uppercase small fw-semibold text-primary mt-3 mb-1">{en.app.tagline}</p>
        <h1 className="mt-1">{en.landing.heroTitle}</h1>
        <p className="lead text-body-secondary col-lg-8 mx-auto">{en.landing.heroSubtitle}</p>
        <div className="d-flex flex-wrap justify-content-center gap-2 mt-4">
          <Link to="/register" className="btn btn-primary btn-lg">
            {en.landing.ctaPrimary}
          </Link>
          <Link to="#features" className="btn btn-outline-secondary btn-lg">
            {en.landing.ctaSecondary}
          </Link>
        </div>
      </section>

      <section id="features" className="py-5">
        <h2 className="text-center mb-4">{en.landing.featuresTitle}</h2>
        <div className="row row-cols-1 row-cols-md-2 row-cols-lg-3 g-4">
          {en.landing.features.map((feature) => (
            <div className="col" key={feature.title}>
              <div className="card h-100">
                <div className="card-body">
                  <i className={`bi ${feature.icon} fs-2 text-bc-accent`} aria-hidden="true" />
                  <h3 className="h5 mt-3">{feature.title}</h3>
                  <p className="card-text text-body-secondary">{feature.body}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="py-5">
        <h2 className="text-center mb-4">{en.landing.howItWorksTitle}</h2>
        <div className="row row-cols-1 row-cols-md-3 g-4">
          {en.landing.howItWorks.map((item) => (
            <div className="col text-center" key={item.step}>
              <div
                className="d-inline-flex align-items-center justify-content-center rounded-circle bg-primary text-white fw-bold fs-4 mb-3"
                style={{ width: '3rem', height: '3rem' }}
                aria-hidden="true"
              >
                {item.step}
              </div>
              <h3 className="h5">{item.title}</h3>
              <p className="text-body-secondary">{item.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
