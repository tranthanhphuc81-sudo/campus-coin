/**
 * PrivacyPage.tsx
 * Public privacy policy page (`/privacy`): plain-language summary of what data CampusCoin
 * collects, AI/email third parties, and user rights (export/delete).
 * Exports: default (PrivacyPage)
 * Spec: docs/diagrams/fig25.jpg (sitemap) · docs/spec/08 (public pages)
 */
import { PageHeader } from '../../../components/PageHeader';
import { en } from '../../../i18n/en';
import { useDocumentMeta } from '../../../lib/seo/useDocumentMeta';

/** Public privacy policy page: renders `en.legal.privacy` verbatim. */
export default function PrivacyPage() {
  useDocumentMeta({ title: en.legal.privacy.title, description: en.legal.privacy.intro });

  return (
    <>
      <PageHeader title={en.legal.privacy.title} />
      <p className="lead">{en.legal.privacy.intro}</p>
      {en.legal.privacy.sections.map((section) => (
        <section key={section.heading} className="mb-4">
          <h2 className="h5">{section.heading}</h2>
          <p className="text-body-secondary mb-0">{section.body}</p>
        </section>
      ))}
    </>
  );
}
