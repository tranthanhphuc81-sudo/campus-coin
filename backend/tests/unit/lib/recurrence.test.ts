/**
 * recurrence.test.ts
 * Unit tests for recurring-rule date math (src/lib/recurrence.ts): occurrence generation,
 * month-end fallback, and period-key grouping.
 * Spec: docs/spec/05a §5.4.2 (recurring transactions)
 */
import { RecurringFrequency } from '@campuscoin/shared';
import { describe, expect, it } from 'vitest';
import { diffInDays } from '../../../src/lib/dates.js';
import {
  countOccurrencesInRange,
  nextOccurrenceAfter,
  occurrenceAt,
  occurrenceOnOrAfter,
  periodKey,
  type RecurrenceSpec,
} from '../../../src/lib/recurrence.js';

/** Builds a monthly spec, filling in sensible defaults for fields the test doesn't care about. */
function monthlySpec(overrides: Partial<RecurrenceSpec>): RecurrenceSpec {
  return {
    frequency: RecurringFrequency.MONTHLY,
    intervalCount: 1,
    dayOfMonth: 1,
    dayOfWeek: null,
    startDate: '2026-01-01',
    endDate: null,
    ...overrides,
  };
}

describe('occurrenceAt · monthly', () => {
  it('falls back to the month-end when dayOfMonth 31 hits a shorter month', () => {
    const spec = monthlySpec({ dayOfMonth: 31, startDate: '2026-01-31' });
    expect(occurrenceAt(spec, 0)).toBe('2026-01-31');
    expect(occurrenceAt(spec, 1)).toBe('2026-02-28'); // 2026 is not a leap year
  });

  it('falls back to Feb 29 in a leap year', () => {
    const spec = monthlySpec({ dayOfMonth: 31, startDate: '2028-01-31' });
    expect(occurrenceAt(spec, 1)).toBe('2028-02-29');
  });

  it('respects an interval greater than 1', () => {
    const spec = monthlySpec({ dayOfMonth: 15, intervalCount: 3, startDate: '2026-01-15' });
    expect(occurrenceAt(spec, 0)).toBe('2026-01-15');
    expect(occurrenceAt(spec, 1)).toBe('2026-04-15');
    expect(occurrenceAt(spec, 2)).toBe('2026-07-15');
  });
});

describe('occurrenceAt · yearly', () => {
  it('falls back to Feb 28 the year after a Feb 29 anchor', () => {
    const spec: RecurrenceSpec = {
      frequency: RecurringFrequency.YEARLY,
      intervalCount: 1,
      dayOfMonth: 29,
      dayOfWeek: null,
      startDate: '2024-02-29',
      endDate: null,
    };
    expect(occurrenceAt(spec, 0)).toBe('2024-02-29');
    expect(occurrenceAt(spec, 1)).toBe('2025-02-28');
    expect(occurrenceAt(spec, 4)).toBe('2028-02-29');
  });
});

describe('occurrenceAt · weekly', () => {
  it('produces occurrences exactly 14 days apart for intervalCount 2', () => {
    const spec: RecurrenceSpec = {
      frequency: RecurringFrequency.WEEKLY,
      intervalCount: 2,
      dayOfMonth: null,
      dayOfWeek: 3, // Wednesday
      startDate: '2026-01-05', // a Monday
      endDate: null,
    };
    const first = occurrenceAt(spec, 0);
    const second = occurrenceAt(spec, 1);
    const third = occurrenceAt(spec, 2);
    expect(diffInDays(first, second)).toBe(14);
    expect(diffInDays(second, third)).toBe(14);
  });
});

describe('occurrenceOnOrAfter', () => {
  it('returns the first occurrence on/after startDate when from is earlier', () => {
    const spec = monthlySpec({ dayOfMonth: 10, startDate: '2026-03-10' });
    expect(occurrenceOnOrAfter(spec, '2026-01-01')).toBe('2026-03-10');
  });

  it('returns null once past endDate', () => {
    const spec = monthlySpec({ dayOfMonth: 10, startDate: '2026-01-10', endDate: '2026-03-10' });
    expect(occurrenceOnOrAfter(spec, '2026-03-11')).toBeNull();
    expect(occurrenceOnOrAfter(spec, '2026-03-10')).toBe('2026-03-10');
  });

  it('finds the correct occurrence far in the future for an old monthly rule', () => {
    const spec = monthlySpec({ dayOfMonth: 1, startDate: '2000-01-01' });
    expect(occurrenceOnOrAfter(spec, '2026-09-15')).toBe('2026-10-01');
  });

  it('finds the correct occurrence for a weekly rule', () => {
    const spec: RecurrenceSpec = {
      frequency: RecurringFrequency.WEEKLY,
      intervalCount: 1,
      dayOfMonth: null,
      dayOfWeek: 5, // Friday
      startDate: '2026-01-05',
      endDate: null,
    };
    expect(occurrenceOnOrAfter(spec, '2026-09-20')).toBe('2026-09-25');
  });
});

describe('nextOccurrenceAfter', () => {
  it('skips the given date itself', () => {
    const spec = monthlySpec({ dayOfMonth: 10, startDate: '2026-01-10' });
    expect(nextOccurrenceAfter(spec, '2026-01-10')).toBe('2026-02-10');
  });
});

describe('countOccurrencesInRange', () => {
  it('counts 4 Wednesdays in October 2026 (a weekly rule anchored on Wednesday)', () => {
    const spec: RecurrenceSpec = {
      frequency: RecurringFrequency.WEEKLY,
      intervalCount: 1,
      dayOfMonth: null,
      dayOfWeek: 3, // Wednesday
      startDate: '2026-01-07', // a Wednesday
      endDate: null,
    };
    expect(countOccurrencesInRange(spec, '2026-10-01', '2026-10-31')).toBe(4);
  });

  it('counts 5 Thursdays in October 2026 (a weekly rule anchored on Thursday)', () => {
    const spec: RecurrenceSpec = {
      frequency: RecurringFrequency.WEEKLY,
      intervalCount: 1,
      dayOfMonth: null,
      dayOfWeek: 4, // Thursday
      startDate: '2026-01-01', // a Thursday
      endDate: null,
    };
    expect(countOccurrencesInRange(spec, '2026-10-01', '2026-10-31')).toBe(5);
  });

  it('a monthly dayOfMonth=31 rule still counts once in a shorter target month (falls back to the last day)', () => {
    const spec = monthlySpec({ dayOfMonth: 31, startDate: '2026-01-31' });
    expect(countOccurrencesInRange(spec, '2027-02-01', '2027-02-28')).toBe(1);
  });

  it('a yearly rule counts once in its anchor month and zero elsewhere', () => {
    const spec: RecurrenceSpec = {
      frequency: RecurringFrequency.YEARLY,
      intervalCount: 1,
      dayOfMonth: 15,
      dayOfWeek: null,
      startDate: '2020-03-15',
      endDate: null,
    };
    expect(countOccurrencesInRange(spec, '2026-03-01', '2026-03-31')).toBe(1);
    expect(countOccurrencesInRange(spec, '2026-04-01', '2026-04-30')).toBe(0);
  });

  it('returns 0 when startDate is after the range end', () => {
    const spec = monthlySpec({ dayOfMonth: 1, startDate: '2027-01-01' });
    expect(countOccurrencesInRange(spec, '2026-10-01', '2026-10-31')).toBe(0);
  });

  it('returns 0 when endDate is before the range start', () => {
    const spec = monthlySpec({ dayOfMonth: 1, startDate: '2025-01-01', endDate: '2026-01-01' });
    expect(countOccurrencesInRange(spec, '2026-10-01', '2026-10-31')).toBe(0);
  });
});

describe('periodKey', () => {
  it('builds a monthly key', () => {
    expect(periodKey(RecurringFrequency.MONTHLY, '2026-09-15')).toBe('2026-09');
  });

  it('builds a yearly key', () => {
    expect(periodKey(RecurringFrequency.YEARLY, '2026-09-15')).toBe('2026');
  });

  it('builds an ISO-week key, including year-boundary weeks', () => {
    expect(periodKey(RecurringFrequency.WEEKLY, '2026-12-31')).toBe('2026-W53');
    expect(periodKey(RecurringFrequency.WEEKLY, '2027-01-01')).toBe('2026-W53');
  });
});
