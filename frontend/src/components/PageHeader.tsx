/**
 * PageHeader.tsx
 * Consistent page title/subtitle/actions row used at the top of every feature page.
 * Exports: PageHeader
 * Spec: docs/spec/08 §8.3 (page layout)
 */
import type { ReactNode } from 'react';

interface PageHeaderProps {
  /** Page title, rendered as the page's `<h1>`. */
  title: string;
  /** Optional secondary line under the title. */
  subtitle?: string;
  /** Optional right-aligned action buttons/links. */
  actions?: ReactNode;
}

/** Renders a page's title (h1), optional subtitle and optional right-aligned actions. */
export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
      <div>
        <h1 className="h2 mb-1">{title}</h1>
        {subtitle ? <p className="text-body-secondary mb-0">{subtitle}</p> : null}
      </div>
      {actions ? <div className="d-flex gap-2">{actions}</div> : null}
    </div>
  );
}
