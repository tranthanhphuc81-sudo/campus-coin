/**
 * TermsPage.tsx
 * Public terms of service page (`/terms`): use of the service, AI-suggestions disclaimer,
 * account responsibility and change notices.
 * Exports: default (TermsPage)
 * Spec: docs/diagrams/fig25.jpg (sitemap) · docs/spec/08 (public pages)
 */
import { PageHeader } from '../../../components/PageHeader';
import { en } from '../../../i18n/en';
import { useDocumentMeta } from '../../../lib/seo/useDocumentMeta';

/** Public terms of service page: renders `en.legal.terms` verbatim. */
export default function TermsPage() {
  useDocumentMeta({ title: en.legal.terms.title, description: en.legal.terms.intro });

  return (
    <>
      <PageHeader title={en.legal.terms.title} />
      <p className="lead">{en.legal.terms.intro}</p>
      {en.legal.terms.sections.map((section) => (
        <section key={section.heading} className="mb-4">
          <h2 className="h5">{section.heading}</h2>
          <p className="text-body-secondary mb-0">{section.body}</p>
        </section>
      ))}
    </>
  );
}
