/**
 * PlaceholderPage.tsx
 * Shared body for every not-yet-built feature page: a `PageHeader` plus a "coming later" note.
 * Real pages replace their `PlaceholderPage` usage phase by phase.
 * Exports: PlaceholderPage
 * Spec: docs/diagrams/fig25.jpg (sitemap)
 */
import { en } from '../i18n/en';
import { PageHeader } from './PageHeader';

interface PlaceholderPageProps {
  title: string;
  subtitle?: string;
}

/** Minimal page body used by every route not yet implemented. */
export function PlaceholderPage({ title, subtitle }: PlaceholderPageProps) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <p className="text-body-secondary">{en.common.comingSoon}</p>
    </>
  );
}
