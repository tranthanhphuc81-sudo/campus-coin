/**
 * dates.ts
 * Date helpers for local calendar dates and user timezones. A "local date" is a
 * `YYYY-MM-DD` string in the user's timezone (txn_date, budget month, tip period); instants
 * are UTC `Date`s. `month` values are always the first day of the month.
 * Prisma maps `@db.Date` columns to `Date` at UTC midnight → use toDbDate / fromDbDate.
 * Main exports: LocalDate, isLocalDate, firstDayOfMonth, lastDayOfMonth, daysInMonth, isoWeek,
 *               toUserLocalDate, todayInTimeZone, userLocalToUtc, toDbDate, fromDbDate,
 *               addDays, diffInDays, isoWeekday, trailingMonths
 * Spec: docs/spec/06 §6.1 (time) · docs/spec/05a §5.4.2 (month-end rule) · docs/spec/05b §5.9-5.10
 */
import { getISOWeek, getISOWeekYear } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

/** Calendar date string `YYYY-MM-DD` (no time, no timezone). */
export type LocalDate = string;

const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Checks that a string is a real calendar date in `YYYY-MM-DD` form (rejects 2026-02-30).
 * @returns true when valid.
 */
export function isLocalDate(value: string): boolean {
  const m = LOCAL_DATE.exec(value);
  if (!m) return false;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

/** Splits a validated local date; throws RangeError for invalid input. */
function parts(date: LocalDate): { year: number; month: number; day: number } {
  if (!isLocalDate(date)) throw new RangeError(`Invalid local date: "${date}"`);
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return { year, month, day };
}

/** Formats numeric parts back to `YYYY-MM-DD`. */
function format(year: number, month: number, day: number): LocalDate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Number of days in a month (handles leap years).
 * @param year - Full year, e.g. 2028.
 * @param month - Month 1–12.
 * @returns 28–31.
 */
export function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month = last day of this month; UTC avoids host-timezone effects.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * First day of the month containing `date` – the canonical `month` value.
 * @throws RangeError for an invalid date.
 */
export function firstDayOfMonth(date: LocalDate): LocalDate {
  const { year, month } = parts(date);
  return format(year, month, 1);
}

/**
 * Last day of the month containing `date` (used for the day 29–31 fallback, §5.4.2).
 * @throws RangeError for an invalid date.
 */
export function lastDayOfMonth(date: LocalDate): LocalDate {
  const { year, month } = parts(date);
  return format(year, month, daysInMonth(year, month));
}

/**
 * ISO-8601 week of a date (weeks start Monday; week 1 contains the first Thursday).
 * @returns `{ year, week }` – `year` is the ISO week-year, which can differ from the calendar year.
 * @throws RangeError for an invalid date.
 */
export function isoWeek(date: LocalDate): { year: number; week: number } {
  const { year, month, day } = parts(date);
  // Local-midnight Date is what date-fns expects; only the calendar fields matter here.
  const d = new Date(year, month - 1, day);
  return { year: getISOWeekYear(d), week: getISOWeek(d) };
}

/**
 * Converts a UTC instant to the user's local calendar date.
 * @param instant - Point in time.
 * @param timeZone - IANA zone, e.g. "Asia/Ho_Chi_Minh".
 * @returns Local date string.
 */
export function toUserLocalDate(instant: Date, timeZone: string): LocalDate {
  return formatInTimeZone(instant, timeZone, 'yyyy-MM-dd');
}

/**
 * Today's date in a timezone.
 * @param timeZone - IANA zone.
 * @param now - Injectable clock for tests.
 */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): LocalDate {
  return toUserLocalDate(now, timeZone);
}

/**
 * Converts a wall-clock time in the user's timezone to a UTC instant.
 * @param localDateTime - `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm[:ss]` in that timezone.
 * @param timeZone - IANA zone.
 * @returns The matching UTC Date.
 * @throws RangeError when the input cannot be parsed.
 */
export function userLocalToUtc(localDateTime: string, timeZone: string): Date {
  const result = fromZonedTime(localDateTime, timeZone);
  if (Number.isNaN(result.getTime()))
    throw new RangeError(`Invalid local date-time: "${localDateTime}"`);
  return result;
}

/**
 * Converts a local date to the `Date` Prisma writes to a `@db.Date` column (UTC midnight).
 * @throws RangeError for an invalid date.
 */
export function toDbDate(date: LocalDate): Date {
  const { year, month, day } = parts(date);
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Converts a `Date` read from a `@db.Date` column back to a local date string.
 */
export function fromDbDate(value: Date): LocalDate {
  return value.toISOString().slice(0, 10);
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Adds (or subtracts, with a negative value) whole days to a local date.
 * Arithmetic is done via UTC midnight instants (never host-local `Date` math), so the result
 * does not depend on the machine's timezone (docs/spec/05a §5.4.2: recurring rule occurrences).
 * @throws RangeError for an invalid `date`.
 */
export function addDays(date: LocalDate, days: number): LocalDate {
  return fromDbDate(new Date(toDbDate(date).getTime() + days * MS_PER_DAY));
}

/**
 * Whole number of days between two local dates (`to` − `from`); negative when `to` is earlier.
 * @throws RangeError for an invalid date.
 */
export function diffInDays(from: LocalDate, to: LocalDate): number {
  return Math.round((toDbDate(to).getTime() - toDbDate(from).getTime()) / MS_PER_DAY);
}

/**
 * ISO weekday of a local date: 1 = Monday .. 7 = Sunday (used to anchor weekly recurring rules).
 * @throws RangeError for an invalid date.
 */
export function isoWeekday(date: LocalDate): number {
  const jsDay = toDbDate(date).getUTCDay(); // 0 (Sunday) .. 6 (Saturday)
  return jsDay === 0 ? 7 : jsDay;
}

/**
 * The `count` trailing calendar months ending at the month containing `date` (inclusive), oldest
 * first (e.g. count=3 on "2026-09-15" -> ["2026-07-01","2026-08-01","2026-09-01"]). Used by the
 * dashboard trend widget and the insights/tips engines' "average of the last N months" stats
 * (docs/spec/05b §5.9.1, §5.10).
 * @throws RangeError for an invalid date or a non-positive count.
 */
export function trailingMonths(date: LocalDate, count: number): LocalDate[] {
  if (!Number.isInteger(count) || count <= 0) throw new RangeError(`Invalid month count: ${count}`);
  const months: LocalDate[] = [];
  let cursor = firstDayOfMonth(date);
  for (let i = 0; i < count; i += 1) {
    months.unshift(cursor);
    cursor = firstDayOfMonth(addDays(cursor, -1));
  }
  return months;
}
