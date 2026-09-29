/**
 * SitemapPage.tsx
 * Public sitemap (`/sitemap`) – lists every route grouped by area. Public routes are real
 * links; student/admin routes require authentication so they are listed as plain text
 * (path + label) rather than clickable links.
 * Exports: default (SitemapPage)
 * Spec: docs/diagrams/fig25.jpg (sitemap)
 */
import { Link } from 'react-router';
import { PageHeader } from '../../../components/PageHeader';
import { en } from '../../../i18n/en';
import { useDocumentMeta } from '../../../lib/seo/useDocumentMeta';

/** A single sitemap entry: route path and its display label. */
interface SitemapEntry {
  to: string;
  label: string;
}

const PUBLIC_LINKS: SitemapEntry[] = [
  { to: '/', label: en.breadcrumbs.home },
  { to: '/features', label: en.nav.features },
  { to: '/login', label: en.nav.login },
  { to: '/register', label: en.nav.register },
  { to: '/forgot-password', label: en.nav.forgotPassword },
  { to: '/privacy', label: en.nav.privacy },
  { to: '/terms', label: en.nav.terms },
  { to: '/sitemap', label: en.nav.sitemap },
  { to: '/help', label: en.nav.help },
];

const STUDENT_LINKS: SitemapEntry[] = [
  { to: '/app', label: en.nav.dashboard },
  { to: '/app/transactions', label: en.nav.transactions },
  { to: '/app/transactions/recurring', label: en.nav.recurring },
  { to: '/app/transactions/import', label: en.nav.importCsv },
  { to: '/app/transactions/trash', label: en.nav.trash },
  { to: '/app/saved', label: en.nav.saved },
  { to: '/app/budgets', label: en.nav.budgets },
  { to: '/app/categories', label: en.nav.categories },
  { to: '/app/reports', label: en.nav.reports },
  { to: '/app/reports/by-period', label: en.nav.reportsByPeriod },
  { to: '/app/reports/by-category', label: en.nav.reportsByCategory },
  { to: '/app/reports/forecast', label: en.nav.reportsForecast },
  { to: '/app/insights', label: en.nav.insights },
  { to: '/app/tips', label: en.nav.tips },
  { to: '/app/profile', label: en.nav.profile },
];

const ADMIN_LINKS: SitemapEntry[] = [
  { to: '/admin/login', label: en.nav.adminLogin },
  { to: '/admin', label: en.nav.dashboard },
  { to: '/admin/users', label: en.nav.adminUsers },
  { to: '/admin/categories', label: en.nav.adminCategories },
  { to: '/admin/tip-templates', label: en.nav.adminTipTemplates },
  { to: '/admin/notifications', label: en.nav.adminNotifications },
  { to: '/admin/stats', label: en.nav.adminStats },
  { to: '/admin/audit-log', label: en.nav.adminAuditLog },
];

/** Renders a group of routes that require authentication as plain (non-clickable) text. */
function AuthRequiredList({ links }: { links: SitemapEntry[] }) {
  return (
    <ul className="list-unstyled">
      {links.map((link) => (
        <li key={link.to} className="mb-1">
          <span className="fw-semibold">{link.label}</span>{' '}
          <code className="text-body-secondary">{link.to}</code>
        </li>
      ))}
    </ul>
  );
}

/** Public sitemap page: every route grouped by public / student / admin area. */
export default function SitemapPage() {
  useDocumentMeta({ title: en.nav.sitemap, description: en.landing.heroSubtitle });

  return (
    <>
      <PageHeader title={en.nav.sitemap} />

      <h2 className="h4">Public</h2>
      <ul className="list-unstyled mb-4">
        {PUBLIC_LINKS.map((link) => (
          <li key={link.to} className="mb-1">
            <Link to={link.to}>{link.label}</Link>
          </li>
        ))}
      </ul>

      <h2 className="h4">Student area (sign in required)</h2>
      <div className="mb-4">
        <AuthRequiredList links={STUDENT_LINKS} />
      </div>

      <h2 className="h4">Admin portal (sign in required)</h2>
      <AuthRequiredList links={ADMIN_LINKS} />
    </>
  );
}
