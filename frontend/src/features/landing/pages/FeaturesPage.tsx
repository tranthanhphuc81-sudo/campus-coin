/**
 * FeaturesPage.tsx
 * Public marketing page describing CampusCoin's features in detail (`/features`).
 * Exports: default (FeaturesPage)
 * Spec: docs/diagrams/fig25.jpg (sitemap) · docs/spec/08 (public pages)
 */
import { PageHeader } from '../../../components/PageHeader';
import { en } from '../../../i18n/en';
import { useDocumentMeta } from '../../../lib/seo/useDocumentMeta';

/** Public features page: one row per feature with icon, title and description. */
export default function FeaturesPage() {
  useDocumentMeta({ title: en.nav.features, description: en.landing.heroSubtitle });

  return (
    <>
      <PageHeader title={en.nav.features} subtitle={en.landing.featuresTitle} />
      <div className="row row-cols-1 g-3">
        {en.landing.features.map((feature) => (
          <div className="col" key={feature.title}>
            <div className="card">
              <div className="card-body d-flex align-items-start gap-3">
                <i className={`bi ${feature.icon} fs-2 text-bc-accent flex-shrink-0`} aria-hidden="true" />
                <div>
                  <h2 className="h5 mb-1">{feature.title}</h2>
                  <p className="card-text text-body-secondary mb-0">{feature.body}</p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
