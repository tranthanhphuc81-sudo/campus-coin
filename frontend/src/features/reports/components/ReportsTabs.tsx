/**
 * ReportsTabs.tsx
 * Tab navigation between the 4 report views (docs/spec/05b §5.8 Bảng 22): By category, Income vs
 * expense (the reports "overview"), Daily/weekly and Forecast. Plain router links styled as
 * Bootstrap nav-tabs — each tab is its own route so its own filters live in its own URL.
 * Exports: ReportsTabs
 * Spec: docs/spec/05b §5.8
 */
import { NavLink } from 'react-router';
import { en } from '../../../i18n/en';

const TABS = [
  { to: '/app/reports', label: en.nav.reports, end: true },
  { to: '/app/reports/by-category', label: en.nav.reportsByCategory },
  { to: '/app/reports/by-period', label: en.nav.reportsByPeriod },
  { to: '/app/reports/forecast', label: en.nav.reportsForecast },
];

/** Bootstrap nav-tabs linking between the 4 report routes. */
export function ReportsTabs() {
  return (
    <ul className="nav nav-tabs mb-3">
      {TABS.map((tab) => (
        <li className="nav-item" key={tab.to}>
          <NavLink to={tab.to} end={tab.end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            {tab.label}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}
