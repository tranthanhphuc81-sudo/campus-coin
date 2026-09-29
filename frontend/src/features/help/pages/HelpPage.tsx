/**
 * HelpPage.tsx
 * Public static FAQ page (`/help`): how to add a transaction, import a CSV, set a budget, how AI
 * categorization/insights work and how to opt out, how to export/delete your data, and how to
 * contact support. Accessible whether logged in or not (mirrors `PrivacyPage`/`TermsPage`'s
 * structure); items that reference account settings link to `/app/profile` (Profile & Settings ›
 * Privacy) — visiting it while logged out simply redirects to `/login` first.
 * Exports: default (HelpPage)
 * Spec: docs/spec/03 §3.4 (chatbot) · docs/diagrams/fig25.jpg (sitemap)
 */
import Accordion from 'react-bootstrap/Accordion';
import { Link } from 'react-router';
import { PageHeader } from '../../../components/PageHeader';
import { en } from '../../../i18n/en';
import { useDocumentMeta } from '../../../lib/seo/useDocumentMeta';

/** Public Help & FAQ page: renders `en.help.items` as an accessible accordion. */
export default function HelpPage() {
  useDocumentMeta({ title: en.help.title, description: en.help.intro });

  return (
    <>
      <PageHeader title={en.help.title} />
      <p className="lead">{en.help.intro}</p>
      <Accordion alwaysOpen={false}>
        {en.help.items.map((item, index) => (
          <Accordion.Item eventKey={String(index)} key={item.question}>
            <Accordion.Header as="h2">{item.question}</Accordion.Header>
            <Accordion.Body>
              <p className="mb-0">
                {item.answer}
                {item.settingsLink ? (
                  <>
                    {' '}
                    <Link to="/app/profile">{en.help.settingsLinkLabel}</Link>.
                  </>
                ) : null}
              </p>
            </Accordion.Body>
          </Accordion.Item>
        ))}
      </Accordion>
    </>
  );
}
