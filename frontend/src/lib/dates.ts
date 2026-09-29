/**
 * dates.ts
 * Small local-date helpers shared by the transactions/categories/recurring/budgets/dashboard UI.
 * Frontend has no date-fns dependency (backend-only in the locked stack) so these use the native
 * `Intl`/`Date` APIs directly, mirroring `MoneyText`'s use of `Intl.NumberFormat` for formatting.
 * Exports: todayLocalDate, formatDisplayDate, formatDateTime, formatRelativeTime, currentLocalMonth,
 *   shiftMonth, formatMonthLabel
 * Spec: docs/spec/05a §5.4 (BR-TX-02 local dates) · docs/spec/05c §5.11 (budgets) · docs/spec/05b §5.7 (dashboard)
 */

/** Returns "today" as a `YYYY-MM-DD` string in the given IANA timezone (defaults to the browser's). */
export function todayLocalDate(timezone?: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Formats a `YYYY-MM-DD` local date string for display, e.g. "Sep 27, 2026". */
export function formatDisplayDate(localDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!match) return localDate;
  const [, year, month, day] = match;
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(Number(year), Number(month) - 1, Number(day)));
}

/** Formats an ISO timestamp for display, e.g. "Sep 27, 2026, 3:45 PM". */
export function formatDateTime(isoTimestamp: string): string {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(isoTimestamp));
}

/** Thresholds (in seconds) for {@link formatRelativeTime}, largest unit first. */
const RELATIVE_TIME_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 60 * 60 * 24 * 365],
  ['month', 60 * 60 * 24 * 30],
  ['week', 60 * 60 * 24 * 7],
  ['day', 60 * 60 * 24],
  ['hour', 60 * 60],
  ['minute', 60],
];

const relativeTimeFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** Formats an ISO timestamp as a short relative phrase, e.g. "5 minutes ago", "yesterday". */
export function formatRelativeTime(isoTimestamp: string): string {
  const diffSec = Math.round((Date.parse(isoTimestamp) - Date.now()) / 1000);
  for (const [unit, secondsInUnit] of RELATIVE_TIME_UNITS) {
    if (Math.abs(diffSec) >= secondsInUnit) {
      return relativeTimeFormatter.format(Math.round(diffSec / secondsInUnit), unit);
    }
  }
  return relativeTimeFormatter.format(diffSec, 'second');
}

/** Returns the first day of "this month" as `YYYY-MM-DD`, in the given IANA timezone. */
export function currentLocalMonth(timezone?: string): string {
  const today = todayLocalDate(timezone);
  return `${today.slice(0, 7)}-01`;
}

/** Splits a `YYYY-MM-DD` (or `YYYY-MM`) string into its numeric year/month parts. */
function parseYearMonth(month: string): { year: number; month: number } {
  const [yearPart, monthPart] = month.split('-');
  return { year: Number(yearPart), month: Number(monthPart) };
}

/** Shifts a `YYYY-MM-DD` month-start date by `delta` whole months (negative moves back). */
export function shiftMonth(month: string, delta: number): string {
  const { year, month: mon } = parseYearMonth(month);
  const d = new Date(Date.UTC(year, mon - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

/** Formats a `YYYY-MM-DD` month-start date as e.g. "September 2026". */
export function formatMonthLabel(month: string): string {
  const { year, month: mon } = parseYearMonth(month);
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date(Date.UTC(year, mon - 1, 1)));
}
