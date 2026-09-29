/**
 * reportRef.ts
 * Pure encode/decode helpers for a report bookmark's `targetRef` (`shared/src/schemas/bookmark.ts`'s
 * `reportTargetRefSchema`): `"<view>"` or `"<view>?<query>"`. Each view has its own small parameter
 * whitelist mirroring that view's own URL-synced filters hook (`useCategoryBreakdownFilters.ts` for
 * `by-category`, `ReportsByPeriodPage`'s `?month=` for `by-period`, `ReportsOverviewPage`'s
 * `?months=` for `overview`, no params for `forecast`), and default values are dropped so two
 * bookmarks of "the same" report never differ only by an implicit default (e.g. `by-category`'s
 * `type=expense`). `reportTargetRefToPath` is the exact inverse, rebuilding a real `/app/reports/*`
 * route — per `bookmark.ts`'s own doc, a report `targetRef` is never treated as a URL/redirect
 * target, only as a small whitelisted key/value list re-validated on the way out.
 * Exports: buildReportTargetRef, reportTargetRefToPath, describeReportRef
 * Spec: docs/spec/05c §5.12
 */
import type { ReportBookmarkView } from '@campuscoin/shared';
import { en } from '../../i18n/en';

/** Ordered whitelist of query params each report view's bookmark ref may carry. */
const VIEW_PARAMS: Record<ReportBookmarkView, readonly string[]> = {
  overview: ['months'],
  'by-period': ['month'],
  'by-category': ['from', 'to', 'type', 'categoryId'],
  forecast: [],
};

/** Values that are the view's own default — dropped so the canonical ref never carries them. */
const VIEW_DEFAULTS: Partial<Record<ReportBookmarkView, Record<string, string>>> = {
  'by-category': { type: 'expense' },
};

/** Real route each view's bookmark opens back up to. */
const VIEW_PATH: Record<ReportBookmarkView, string> = {
  overview: '/app/reports',
  'by-period': '/app/reports/by-period',
  'by-category': '/app/reports/by-category',
  forecast: '/app/reports/forecast',
};

/** Charset accepted by the backend's `reportTargetRefSchema` query part — only ever build from this. */
const SAFE_VALUE = /^[A-Za-z0-9,-]+$/;

function isReportBookmarkView(value: string): value is ReportBookmarkView {
  return value in VIEW_PARAMS;
}

/**
 * Builds a report bookmark's `targetRef` from a view + its current filter params: keeps only
 * whitelisted keys (in a fixed order, so two equal filter states always produce the exact same
 * string for the backend's duplicate-bookmark check), drops the view's own default value, and
 * validates each value's charset so a bookmark can never be created with a ref the server would
 * reject.
 * @param view - one of `REPORT_BOOKMARK_VIEWS`.
 * @param params - the view's current filter state, as a flat string map (e.g. from `URLSearchParams`).
 * @returns the canonical `targetRef`, e.g. `"by-category?from=2026-01-01&to=2026-01-31"`.
 */
export function buildReportTargetRef(view: ReportBookmarkView, params: Record<string, string | undefined>): string {
  const defaults = VIEW_DEFAULTS[view] ?? {};
  const pairs: string[] = [];
  for (const key of VIEW_PARAMS[view]) {
    const value = params[key];
    if (!value || defaults[key] === value || !SAFE_VALUE.test(value)) continue;
    pairs.push(`${key}=${value}`);
  }
  return pairs.length === 0 ? view : `${view}?${pairs.join('&')}`;
}

/**
 * Inverse of {@link buildReportTargetRef}: turns a stored `targetRef` back into a real
 * `/app/reports/*` route the "Open" action can navigate to. Unknown views/params are dropped rather
 * than thrown — a bookmark's `target.available` already tells the caller whether the ref still
 * makes sense; this only ever needs to produce *a* safe internal path, never treat the ref as a URL.
 */
export function reportTargetRefToPath(ref: string): string {
  const [rawView, query] = ref.split('?', 2);
  const view = rawView && isReportBookmarkView(rawView) ? rawView : 'overview';
  const base = VIEW_PATH[view];
  if (!query) return base;

  const whitelist = new Set(VIEW_PARAMS[view]);
  const search = new URLSearchParams();
  for (const pair of query.split('&')) {
    const [key, value] = pair.split('=', 2);
    if (key && value && whitelist.has(key)) search.set(key, value);
  }
  const qs = search.toString();
  return qs ? `${base}?${qs}` : base;
}

/** Human-readable label for a report bookmark row on `/app/saved`, e.g. "By category". */
export function describeReportRef(ref: string): string {
  const [rawView] = ref.split('?', 2);
  switch (rawView) {
    case 'by-category':
      return en.nav.reportsByCategory;
    case 'by-period':
      return en.nav.reportsByPeriod;
    case 'forecast':
      return en.nav.reportsForecast;
    default:
      return en.nav.reports;
  }
}
