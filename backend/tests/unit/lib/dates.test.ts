/**
 * dates.test.ts
 * Unit tests for local-date and timezone helpers (src/lib/dates.ts).
 * Spec: docs/spec/06 §6.1 (time) · docs/spec/05a §5.4.2 · docs/spec/12 (testing plan)
 */
import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysInMonth,
  diffInDays,
  firstDayOfMonth,
  fromDbDate,
  isLocalDate,
  isoWeek,
  isoWeekday,
  lastDayOfMonth,
  toDbDate,
  toUserLocalDate,
  todayInTimeZone,
  trailingMonths,
  userLocalToUtc,
} from '../../../src/lib/dates.js';

const HCM = 'Asia/Ho_Chi_Minh'; // UTC+7, no DST
const NY = 'America/New_York'; // has DST

describe('isLocalDate', () => {
  it('accepts real dates only', () => {
    expect(isLocalDate('2026-09-26')).toBe(true);
    expect(isLocalDate('2028-02-29')).toBe(true);
    expect(isLocalDate('2026-02-29')).toBe(false);
    expect(isLocalDate('2026-13-01')).toBe(false);
    expect(isLocalDate('2026-9-1')).toBe(false);
    expect(isLocalDate('2026-09-26T00:00')).toBe(false);
  });
});

describe('month helpers', () => {
  it('daysInMonth handles leap years', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2100, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  it('firstDayOfMonth returns the canonical month value', () => {
    expect(firstDayOfMonth('2026-09-26')).toBe('2026-09-01');
    expect(firstDayOfMonth('2026-01-01')).toBe('2026-01-01');
  });

  it('lastDayOfMonth handles month ends', () => {
    expect(lastDayOfMonth('2026-02-10')).toBe('2026-02-28');
    expect(lastDayOfMonth('2028-02-10')).toBe('2028-02-29');
    expect(lastDayOfMonth('2026-12-01')).toBe('2026-12-31');
  });

  it('throws on invalid dates', () => {
    expect(() => firstDayOfMonth('2026-02-30')).toThrow(RangeError);
    expect(() => lastDayOfMonth('nope')).toThrow(RangeError);
  });
});

describe('isoWeek', () => {
  it('returns week-year that differs from the calendar year at boundaries', () => {
    expect(isoWeek('2026-01-01')).toEqual({ year: 2026, week: 1 }); // Thursday
    expect(isoWeek('2027-01-01')).toEqual({ year: 2026, week: 53 }); // Friday
    expect(isoWeek('2024-12-30')).toEqual({ year: 2025, week: 1 }); // Monday
  });

  it('handles a mid-year date', () => {
    expect(isoWeek('2026-09-26')).toEqual({ year: 2026, week: 39 });
  });
});

describe('timezone conversion', () => {
  it('toUserLocalDate crosses midnight correctly', () => {
    const instant = new Date('2026-09-26T18:30:00Z');
    expect(toUserLocalDate(instant, HCM)).toBe('2026-09-27');
    expect(toUserLocalDate(instant, 'UTC')).toBe('2026-09-26');
    expect(toUserLocalDate(new Date('2026-09-27T02:00:00Z'), NY)).toBe('2026-09-26');
  });

  it('todayInTimeZone uses the injected clock', () => {
    expect(todayInTimeZone(HCM, new Date('2026-12-31T17:00:00Z'))).toBe('2027-01-01');
  });

  it('userLocalToUtc converts wall-clock time to UTC', () => {
    expect(userLocalToUtc('2026-09-27T00:00', HCM).toISOString()).toBe('2026-09-26T17:00:00.000Z');
    expect(userLocalToUtc('2026-01-15T12:00', NY).toISOString()).toBe('2026-01-15T17:00:00.000Z');
    expect(userLocalToUtc('2026-07-15T12:00', NY).toISOString()).toBe('2026-07-15T16:00:00.000Z');
  });

  it('userLocalToUtc rejects garbage', () => {
    expect(() => userLocalToUtc('not a date', HCM)).toThrow(RangeError);
  });
});

describe('addDays', () => {
  it('adds and subtracts whole days across month/year boundaries', () => {
    expect(addDays('2026-09-26', 1)).toBe('2026-09-27');
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('throws on an invalid date', () => {
    expect(() => addDays('2026-02-30', 1)).toThrow(RangeError);
  });
});

describe('diffInDays', () => {
  it('returns a positive count when to is after from, negative otherwise', () => {
    expect(diffInDays('2026-09-01', '2026-09-10')).toBe(9);
    expect(diffInDays('2026-09-10', '2026-09-01')).toBe(-9);
    expect(diffInDays('2026-01-01', '2026-01-01')).toBe(0);
  });
});

describe('isoWeekday', () => {
  it('returns 1 (Monday) .. 7 (Sunday)', () => {
    expect(isoWeekday('2026-09-28')).toBe(1); // Monday
    expect(isoWeekday('2026-09-27')).toBe(7); // Sunday
    expect(isoWeekday('2026-10-01')).toBe(4); // Thursday
  });
});

describe('DB date mapping', () => {
  it('round-trips through UTC midnight', () => {
    const d = toDbDate('2026-02-28');
    expect(d.toISOString()).toBe('2026-02-28T00:00:00.000Z');
    expect(fromDbDate(d)).toBe('2026-02-28');
  });

  it('rejects invalid dates', () => {
    expect(() => toDbDate('2026-02-29')).toThrow(RangeError);
  });
});

describe('trailingMonths', () => {
  it('returns the N trailing calendar months (inclusive), oldest first', () => {
    expect(trailingMonths('2026-09-15', 3)).toEqual(['2026-07-01', '2026-08-01', '2026-09-01']);
  });

  it('returns just the current month for count=1', () => {
    expect(trailingMonths('2026-09-15', 1)).toEqual(['2026-09-01']);
  });

  it('crosses a year boundary', () => {
    expect(trailingMonths('2026-02-10', 3)).toEqual(['2025-12-01', '2026-01-01', '2026-02-01']);
  });

  it('rejects a non-positive count', () => {
    expect(() => trailingMonths('2026-09-15', 0)).toThrow(RangeError);
    expect(() => trailingMonths('2026-09-15', -1)).toThrow(RangeError);
  });

  it('rejects a non-integer count', () => {
    expect(() => trailingMonths('2026-09-15', 1.5)).toThrow(RangeError);
  });

  it('rejects an invalid date', () => {
    expect(() => trailingMonths('2026-02-30', 3)).toThrow(RangeError);
  });
});
