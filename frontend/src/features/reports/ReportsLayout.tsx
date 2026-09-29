/**
 * ReportsLayout.tsx
 * Shared chrome for every `/app/reports/*` tab (docs/spec/05b §5.8): page title, tab nav, and the
 * month-scoped "Export PDF"/"Share by email" bar — kept here (not per-page) so the chosen export
 * month survives switching tabs. Also hosts the "Save this report" bookmark button (P14): its
 * `targetRef` is derived from the *current* route (which tab + that tab's own URL-synced filters),
 * via `buildReportTargetRef`. Not lazy-loaded (a small, always-needed shell, like `StudentLayout`),
 * unlike the 4 tab pages themselves.
 * Exports: ReportsLayout
 * Spec: docs/spec/05b §5.8 · docs/spec/05c §5.12 (bookmarks)
 */
import { BookmarkTargetType, type ReportBookmarkView } from '@campuscoin/shared';
import { useMemo, useState } from 'react';
import { Outlet, useLocation, useSearchParams } from 'react-router';
import { PageHeader } from '../../components/PageHeader';
import { BookmarkButton } from '../bookmarks/components/BookmarkButton';
import { buildReportTargetRef } from '../bookmarks/reportRef';
import { en } from '../../i18n/en';
import { useAuth } from '../../lib/auth/AuthContext';
import { currentLocalMonth } from '../../lib/dates';
import { MonthlyExportShareBar } from './components/MonthlyExportShareBar';
import { ReportsTabs } from './components/ReportsTabs';

/** Maps the active `/app/reports/*` pathname to its `ReportBookmarkView` key. */
function viewFromPathname(pathname: string): ReportBookmarkView {
  if (pathname.endsWith('/reports/by-category')) return 'by-category';
  if (pathname.endsWith('/reports/by-period')) return 'by-period';
  if (pathname.endsWith('/reports/forecast')) return 'forecast';
  return 'overview';
}

/** Layout route wrapping the 4 report tabs with shared title/tabs/export-share/bookmark actions. */
export function ReportsLayout() {
  const { user } = useAuth();
  const [exportMonth, setExportMonth] = useState(() => currentLocalMonth(user?.timezone));
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const view = viewFromPathname(location.pathname);
  const targetRef = useMemo(() => buildReportTargetRef(view, Object.fromEntries(searchParams)), [view, searchParams]);

  return (
    <div>
      <PageHeader
        title={en.nav.reports}
        actions={
          <>
            <MonthlyExportShareBar month={exportMonth} onMonthChange={setExportMonth} />
            <BookmarkButton targetType={BookmarkTargetType.REPORT} targetRef={targetRef} label={en.reports.bookmarkReport} />
          </>
        }
      />
      <ReportsTabs />
      <Outlet />
    </div>
  );
}
