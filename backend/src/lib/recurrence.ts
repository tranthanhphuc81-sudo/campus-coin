/**
 * recurrence.ts
 * Pure date math for recurring transaction rules: computing the k-th occurrence of a rule and
 * the next occurrence on/after a given date. Day 29–31 of a monthly/yearly rule falls back to
 * the month's last day when the target month is shorter (e.g. 31 -> Feb 28/29).
 * All functions are pure and deterministic so the daily materialize job (P07 stage 3) can safely
 * call them more than once without double-creating transactions. `countOccurrencesInRange` (P14)
 * is the forecast module's own use of this same math: how many times a rule will still fire within
 * next month's window, reusing `occurrenceOnOrAfter`/`nextOccurrenceAfter` rather than
 * re-implementing occurrence-walking a second time.
 * Main exports: RecurrenceSpec, occurrenceAt, occurrenceOnOrAfter, nextOccurrenceAfter,
 *   periodKey, ruleToSpec, countOccurrencesInRange
 * Spec: docs/spec/05a §5.4.2 (recurring transactions) · docs/spec/05c §5.14 (forecast)
 */
import { RecurringFrequency } from '@campuscoin/shared';
import { addDays, daysInMonth, diffInDays, fromDbDate, isoWeek, isoWeekday, type LocalDate } from './dates.js';

/** The recurrence parameters of a rule, with dates already converted to local-date strings. */
export interface RecurrenceSpec {
  frequency: RecurringFrequency;
  intervalCount: number;
  dayOfMonth: number | null;
  dayOfWeek: number | null;
  startDate: LocalDate;
  endDate: LocalDate | null;
}

/** Positive-result modulo (JS `%` can return a negative value for a negative dividend). */
function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/** Formats numeric year/month/day parts as `YYYY-MM-DD`. */
function formatDate(year: number, month: number, day: number): LocalDate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Splits a `YYYY-MM-DD` string into `[year, month]` (day is not needed by the callers below). */
function splitYearMonth(date: LocalDate): [number, number] {
  return [Number(date.slice(0, 4)), Number(date.slice(5, 7))];
}

/** First occurrence of a weekly rule on/after `startDate` (the anchor for every `occurrenceAt` call). */
function firstWeeklyOccurrence(spec: RecurrenceSpec): LocalDate {
  return addDays(spec.startDate, mod(spec.dayOfWeek! - isoWeekday(spec.startDate), 7));
}

/**
 * Computes the k-th occurrence of a recurring rule (k = 0 is the first occurrence, on/after
 * `startDate`). Monthly/yearly rules clamp the day to the target month's last day (§5.4.2).
 * @throws RangeError for an unknown frequency.
 */
export function occurrenceAt(spec: RecurrenceSpec, k: number): LocalDate {
  const [startYear, startMonth] = splitYearMonth(spec.startDate);
  switch (spec.frequency) {
    case RecurringFrequency.MONTHLY: {
      const totalMonths = startYear * 12 + (startMonth - 1) + k * spec.intervalCount;
      const year = Math.floor(totalMonths / 12);
      const month = mod(totalMonths, 12) + 1;
      return formatDate(year, month, Math.min(spec.dayOfMonth!, daysInMonth(year, month)));
    }
    case RecurringFrequency.YEARLY: {
      const year = startYear + k * spec.intervalCount;
      return formatDate(year, startMonth, Math.min(spec.dayOfMonth!, daysInMonth(year, startMonth)));
    }
    case RecurringFrequency.WEEKLY:
      return addDays(firstWeeklyOccurrence(spec), 7 * spec.intervalCount * k);
    default:
      throw new RangeError(`Unknown recurring frequency: ${String(spec.frequency)}`);
  }
}

/** Smallest `k` (>= `kFloor`) whose occurrence is on/after `target`; relies on `occurrenceAt` being non-decreasing in `k`. */
function findSmallestKOnOrAfter(spec: RecurrenceSpec, target: LocalDate, kFloor: number): number {
  let k = kFloor;
  while (occurrenceAt(spec, k) < target) k++;
  return k;
}

/**
 * Smallest occurrence of a rule that is on/after `max(from, startDate)`.
 * @returns The occurrence date, or `null` when it would fall after `endDate`.
 */
export function occurrenceOnOrAfter(spec: RecurrenceSpec, from: LocalDate): LocalDate | null {
  const target = from > spec.startDate ? from : spec.startDate;
  let result: LocalDate;

  if (spec.frequency === RecurringFrequency.WEEKLY) {
    const first = firstWeeklyOccurrence(spec);
    const periodDays = 7 * spec.intervalCount;
    const k0 = Math.max(0, Math.ceil(diffInDays(first, target) / periodDays));
    result = occurrenceAt(spec, k0);
  } else {
    // Estimate k from a months-based diff (no need to loop from k=0 for an old rule), then walk
    // forward from a safety margin below the estimate — occurrenceAt is monotonic in k, so this
    // always lands on the exact smallest valid k even if the estimate is slightly off.
    const [targetYear, targetMonth] = splitYearMonth(target);
    const [startYear, startMonth] = splitYearMonth(spec.startDate);
    const monthsPerOccurrence = spec.frequency === RecurringFrequency.YEARLY ? 12 * spec.intervalCount : spec.intervalCount;
    const diffMonths = targetYear * 12 + (targetMonth - 1) - (startYear * 12 + (startMonth - 1));
    const kEstimate = Math.max(0, Math.floor(diffMonths / monthsPerOccurrence) - 2);
    const k = findSmallestKOnOrAfter(spec, target, kEstimate);
    result = occurrenceAt(spec, k);
  }

  return spec.endDate && result > spec.endDate ? null : result;
}

/** Smallest occurrence strictly after `date` (or `null` when it would fall after `endDate`). */
export function nextOccurrenceAfter(spec: RecurrenceSpec, date: LocalDate): LocalDate | null {
  return occurrenceOnOrAfter(spec, addDays(date, 1));
}

/**
 * Groups an occurrence date into the period key used to guard against double-materializing the
 * same period (e.g. one "monthly" transaction per `YYYY-MM`).
 * @throws RangeError for an unknown frequency.
 */
export function periodKey(frequency: RecurringFrequency, date: LocalDate): string {
  switch (frequency) {
    case RecurringFrequency.MONTHLY:
      return date.slice(0, 7);
    case RecurringFrequency.YEARLY:
      return date.slice(0, 4);
    case RecurringFrequency.WEEKLY: {
      const { year, week } = isoWeek(date);
      return `${year}-W${String(week).padStart(2, '0')}`;
    }
    default:
      throw new RangeError(`Unknown recurring frequency: ${String(frequency)}`);
  }
}

/** Shape of the Prisma `recurring_rules` fields needed to build a {@link RecurrenceSpec}. */
export interface RecurringRuleDateFields {
  frequency: RecurringFrequency;
  intervalCount: number;
  dayOfMonth: number | null;
  dayOfWeek: number | null;
  startDate: Date;
  endDate: Date | null;
}

/** Converts Prisma `@db.Date` fields (UTC-midnight `Date`s) into a {@link RecurrenceSpec}. */
export function ruleToSpec(rule: RecurringRuleDateFields): RecurrenceSpec {
  return {
    frequency: rule.frequency,
    intervalCount: rule.intervalCount,
    dayOfMonth: rule.dayOfMonth,
    dayOfWeek: rule.dayOfWeek,
    startDate: fromDbDate(rule.startDate),
    endDate: rule.endDate ? fromDbDate(rule.endDate) : null,
  };
}

/**
 * Counts how many times a rule occurs within `[from, to]` inclusive (docs/spec/05c §5.14: the
 * forecast module's "known recurring amount due next month"). Walks forward from the first
 * occurrence on/after `from` via {@link nextOccurrenceAfter} — naturally bounded by the rule's own
 * frequency (a weekly rule fires at most ~5 times in a month, monthly/yearly at most once), so no
 * separate iteration cap is needed. `spec.startDate`/`spec.endDate` are respected because
 * `occurrenceOnOrAfter`/`nextOccurrenceAfter` already enforce them.
 * @param spec - The rule's recurrence parameters.
 * @param from - Start of the range, inclusive.
 * @param to - End of the range, inclusive.
 * @returns Number of occurrences in `[from, to]` (0 when none fall in range).
 */
export function countOccurrencesInRange(spec: RecurrenceSpec, from: LocalDate, to: LocalDate): number {
  let count = 0;
  let occurrence = occurrenceOnOrAfter(spec, from);
  while (occurrence !== null && occurrence <= to) {
    count += 1;
    occurrence = nextOccurrenceAfter(spec, occurrence);
  }
  return count;
}
