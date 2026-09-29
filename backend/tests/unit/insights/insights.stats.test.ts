/**
 * insights.stats.test.ts
 * Unit tests for the pure spending-pattern detection algorithm (docs/spec/05b §5.9.1) — no DB,
 * no I/O. Covers avg3, the growth-flag ratio/abs-floor boundaries, weeklyCap rounding, TC-22
 * (Food +40% vs its 3-month average), top-N ranking, budget_exceeded+growth co-occurrence,
 * new_category gating, and largest_expense's always-unranked-4th-entry rule.
 * Spec: docs/spec/05b §5.9.1 · docs/spec/12 (TC-22)
 */
import { describe, expect, it } from 'vitest';
import type { LocalDate } from '../../../src/lib/dates.js';
import { Decimal } from '../../../src/lib/money.js';
import {
  avg3,
  buildInsightSnapshot,
  growthPct,
  isGrowthFlagged,
  savingsRatePct,
  weeklyCap,
  type CategoryStatsInput,
  type InsightStatsInput,
} from '../../../src/modules/insights/insights.stats.js';

const MONTH: LocalDate = '2026-09-01';
const d = (v: string) => new Decimal(v);

function category(
  categoryId: number,
  categoryName: string,
  cur: string,
  priorMonths: (string | null)[],
  budgetLimit: string | null = null,
): CategoryStatsInput {
  return {
    categoryId,
    categoryName,
    cur: d(cur),
    priorMonths: priorMonths.map((v) => (v === null ? null : d(v))),
    budgetLimit: budgetLimit === null ? null : d(budgetLimit),
  };
}

function makeInput(overrides: Partial<InsightStatsInput> = {}): InsightStatsInput {
  return {
    month: MONTH,
    currency: 'USD',
    allowanceBaseline: null,
    totalIncome: d('1000'),
    totalExpense: d('700'),
    categories: [],
    largestExpense: null,
    hasAnyPriorMonthHistory: true,
    ...overrides,
  };
}

describe('avg3', () => {
  it('returns null with 0 non-null months', () => {
    expect(avg3([null, null, null])).toBeNull();
  });

  it('returns null with only 1 non-null month (below INSIGHT_AVG_MIN_MONTHS)', () => {
    expect(avg3([d('10'), null, null])).toBeNull();
  });

  it('averages exactly the 2 non-null months', () => {
    expect(avg3([d('10'), d('20'), null])?.toFixed(2)).toBe('15.00');
  });

  it('averages all 3 months when none are null', () => {
    expect(avg3([d('10'), d('20'), d('30')])?.toFixed(2)).toBe('20.00');
  });
});

describe('growthPct', () => {
  it('computes a rounded whole-percent change', () => {
    expect(growthPct(d('140'), d('100'))).toBe(40);
  });
});

describe('isGrowthFlagged: ratio boundary', () => {
  it('exactly 25% ratio flags (>=)', () => {
    expect(isGrowthFlagged(d('125'), d('100'), 'USD', null)).toBe(true);
  });

  it('just under 25% ratio does not flag', () => {
    expect(isGrowthFlagged(d('124.99'), d('100'), 'USD', null)).toBe(false);
  });
});

describe('isGrowthFlagged: absolute-floor boundary', () => {
  it('diff exactly at the flat USD floor ($5) flags', () => {
    expect(isGrowthFlagged(d('15'), d('10'), 'USD', null)).toBe(true); // diff=5, ratio=0.5
  });

  it('diff just under the floor does not flag, even with a high ratio', () => {
    expect(isGrowthFlagged(d('13'), d('10'), 'USD', null)).toBe(false); // diff=3, ratio=0.3
  });

  it('an allowance-based floor overrides the flat floor when larger', () => {
    // floor = max(flat 5, 200 * 5% = 10) = 10; diff=5 < 10 -> not flagged despite ratio 0.5.
    expect(isGrowthFlagged(d('15'), d('10'), 'USD', d('200'))).toBe(false);
  });
});

describe('weeklyCap', () => {
  it('rounds avg/4.33 half-up to 2 decimal places', () => {
    expect(weeklyCap(d('1.00')).toFixed(2)).toBe('0.23');
    expect(weeklyCap(d('10.00')).toFixed(2)).toBe('2.31');
    expect(weeklyCap(d('107.00')).toFixed(2)).toBe('24.71');
  });
});

describe('savingsRatePct', () => {
  it('is null when income is 0', () => {
    expect(savingsRatePct(d('0'), d('50'))).toBeNull();
  });

  it('computes a rounded whole-percent savings rate', () => {
    expect(savingsRatePct(d('100'), d('70'))).toBe(30);
  });
});

describe('buildInsightSnapshot', () => {
  it('TC-22: Food +40% vs its 3-month average is flagged with correct growthPct and a non-null weeklyCap', () => {
    const input = makeInput({ categories: [category(1, 'Food', '140', ['100', '100', '100'])] });
    const { flaggedPatterns } = buildInsightSnapshot(input);

    expect(flaggedPatterns).toHaveLength(1);
    expect(flaggedPatterns[0]).toMatchObject({ kind: 'growth', categoryName: 'Food', growthPct: 40, avg3: '100.00' });
    expect(flaggedPatterns[0]!.weeklyCap).toBe('23.09');
  });

  it('ranks by severity (not insertion order) and keeps only the top 3', () => {
    // All 4 pass the 25% ratio (avg=40 in each); diffs (severities) are 10, 20, 30, 40 respectively.
    const input = makeInput({
      categories: [
        category(1, 'A', '50', ['40', '40', '40']), // diff 10 (boundary ratio exactly 0.25)
        category(2, 'B', '60', ['40', '40', '40']), // diff 20
        category(3, 'C', '70', ['40', '40', '40']), // diff 30
        category(4, 'D', '80', ['40', '40', '40']), // diff 40
      ],
    });
    const { flaggedPatterns } = buildInsightSnapshot(input);

    expect(flaggedPatterns).toHaveLength(3);
    expect(flaggedPatterns.map((p) => p.categoryName)).toEqual(['D', 'C', 'B']); // highest severity first, A dropped
  });

  it('a category can produce both a growth AND a budget_exceeded entry', () => {
    const input = makeInput({
      categories: [category(1, 'Food', '80', ['40', '40', '40'], '60')], // growth diff=40; exceeded by 20
    });
    const { flaggedPatterns } = buildInsightSnapshot(input);

    expect(flaggedPatterns).toHaveLength(2);
    const kinds = flaggedPatterns.map((p) => p.kind).sort();
    expect(kinds).toEqual(['budget_exceeded', 'growth']);
    expect(flaggedPatterns.every((p) => p.categoryId === 1)).toBe(true);
  });

  it('suppresses new_category when the user has no prior-month history at all', () => {
    const category1 = category(1, 'Books', '30', [null, null, null]);
    const withoutHistory = buildInsightSnapshot(makeInput({ categories: [category1], hasAnyPriorMonthHistory: false }));
    expect(withoutHistory.flaggedPatterns).toHaveLength(0);

    const withHistory = buildInsightSnapshot(makeInput({ categories: [category1], hasAnyPriorMonthHistory: true }));
    expect(withHistory.flaggedPatterns).toHaveLength(1);
    expect(withHistory.flaggedPatterns[0]).toMatchObject({ kind: 'new_category', categoryName: 'Books', amount: '30.00' });
  });

  it('largest_expense is always present and unranked, even when smaller than the top-3 cutoff', () => {
    const input = makeInput({
      categories: [
        category(1, 'A', '80', ['40', '40', '40']), // diff 40
        category(2, 'B', '70', ['40', '40', '40']), // diff 30
        category(3, 'C', '60', ['40', '40', '40']), // diff 20
      ],
      largestExpense: { categoryName: 'Rent', amount: d('5.00') }, // far smaller severity than any ranked entry
    });
    const { flaggedPatterns } = buildInsightSnapshot(input);

    expect(flaggedPatterns).toHaveLength(4);
    expect(flaggedPatterns[3]).toMatchObject({ kind: 'largest_expense', categoryName: 'Rent', amount: '5.00', categoryId: null });
  });
});
