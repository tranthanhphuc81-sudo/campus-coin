/**
 * reportRef.test.ts
 * Verifies: `buildReportTargetRef`/`reportTargetRefToPath` round-trip for every view, the
 * whitelist drops params the view doesn't own, `by-category`'s default `type=expense` is dropped,
 * `forecast` never carries a query, and `describeReportRef` labels each view.
 */
import { describe, expect, it } from 'vitest';
import { en } from '../../i18n/en';
import { buildReportTargetRef, describeReportRef, reportTargetRefToPath } from './reportRef';

describe('buildReportTargetRef', () => {
  it('encodes overview months', () => {
    expect(buildReportTargetRef('overview', { months: '12' })).toBe('overview?months=12');
  });

  it('drops the default by-category type but keeps a non-default one', () => {
    expect(buildReportTargetRef('by-category', { from: '2026-01-01', to: '2026-01-31', type: 'expense' })).toBe(
      'by-category?from=2026-01-01&to=2026-01-31',
    );
    expect(buildReportTargetRef('by-category', { from: '2026-01-01', to: '2026-01-31', type: 'income' })).toBe(
      'by-category?from=2026-01-01&to=2026-01-31&type=income',
    );
  });

  it('never carries a query for forecast', () => {
    expect(buildReportTargetRef('forecast', { anything: '1' })).toBe('forecast');
  });

  it('ignores params outside the view\'s whitelist', () => {
    expect(buildReportTargetRef('by-period', { month: '2026-09-01', minAmount: '5.00' })).toBe('by-period?month=2026-09-01');
  });

  it('drops a value with characters outside the safe charset', () => {
    expect(buildReportTargetRef('by-period', { month: '2026-09-01;drop table' })).toBe('by-period');
  });
});

describe('reportTargetRefToPath', () => {
  it.each([
    ['overview', '/app/reports'],
    ['overview?months=3', '/app/reports?months=3'],
    ['by-period?month=2026-09-01', '/app/reports/by-period?month=2026-09-01'],
    ['by-category?from=2026-01-01&to=2026-01-31&type=income', '/app/reports/by-category?from=2026-01-01&to=2026-01-31&type=income'],
    ['forecast', '/app/reports/forecast'],
  ])('decodes %s', (ref, expected) => {
    expect(reportTargetRefToPath(ref)).toBe(expected);
  });

  it('drops a param outside the whitelist when decoding', () => {
    expect(reportTargetRefToPath('by-period?month=2026-09-01&evil=1')).toBe('/app/reports/by-period?month=2026-09-01');
  });

  it('round-trips build -> decode for every view', () => {
    const cases: Array<[Parameters<typeof buildReportTargetRef>[0], Record<string, string>]> = [
      ['overview', { months: '6' }],
      ['by-period', { month: '2026-09-01' }],
      ['by-category', { from: '2026-01-01', to: '2026-01-31', type: 'income', categoryId: '1,2' }],
      ['forecast', {}],
    ];
    for (const [view, params] of cases) {
      const ref = buildReportTargetRef(view, params);
      expect(reportTargetRefToPath(ref)).toContain(view === 'overview' ? '/app/reports' : `/app/reports/${view}`);
    }
  });
});

describe('describeReportRef', () => {
  it('labels each view', () => {
    expect(describeReportRef('overview?months=6')).toBe(en.nav.reports);
    expect(describeReportRef('by-category?from=2026-01-01')).toBe(en.nav.reportsByCategory);
    expect(describeReportRef('by-period?month=2026-09-01')).toBe(en.nav.reportsByPeriod);
    expect(describeReportRef('forecast')).toBe(en.nav.reportsForecast);
  });
});
