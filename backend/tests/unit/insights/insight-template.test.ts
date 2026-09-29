/**
 * insight-template.test.ts
 * Unit tests for the deterministic template-based insight fallback (`insight.template.ts`), used
 * whenever the LLM path is unavailable/rejected (docs/spec/05b §5.9.1/§5.9.3). Pure function, no
 * mocks needed.
 * Spec: docs/spec/05b §5.9.1 (flagged patterns) · §5.9.3 (fallback wording)
 */
import { describe, expect, it } from 'vitest';
import { buildTemplateInsight } from '../../../src/modules/insights/insight.template.js';

const CURRENCY = 'USD';

describe('buildTemplateInsight', () => {
  it('falls back to the generic summary/tip with no flagged patterns and no savings rate', () => {
    const result = buildTemplateInsight({ flaggedPatterns: [], savingsRatePct: null }, CURRENCY);
    expect(result.summaryText).toBe('Your spending looked steady this month — no unusual patterns detected.');
    expect(result.tipText).toBe('Keep tracking your spending to stay on top of your budget.');
  });

  it('a lone largest_expense pattern never drives the headline (falls back to generic)', () => {
    const result = buildTemplateInsight(
      { flaggedPatterns: [{ kind: 'largest_expense', categoryId: 1, categoryName: 'Rent', amount: '500.00', avg3: null, growthPct: null, weeklyCap: null }], savingsRatePct: null },
      CURRENCY,
    );
    expect(result.summaryText).toBe('Your spending looked steady this month — no unusual patterns detected.');
  });

  it('growth: headline names the category/percent, tip suggests the weekly cap', () => {
    const result = buildTemplateInsight(
      {
        flaggedPatterns: [{ kind: 'growth', categoryId: 1, categoryName: 'Food', amount: '200.00', avg3: '100.00', growthPct: 40, weeklyCap: '25.00' }],
        savingsRatePct: null,
      },
      CURRENCY,
    );
    expect(result.summaryText).toBe('Your spending on Food was 40% higher than usual this month.');
    expect(result.tipText).toBe('Try capping it at $25.00/week for the rest of the month.');
  });

  it('growth without a weeklyCap falls back to the generic tip', () => {
    const result = buildTemplateInsight(
      { flaggedPatterns: [{ kind: 'growth', categoryId: 1, categoryName: 'Food', amount: '200.00', avg3: '100.00', growthPct: 40, weeklyCap: null }], savingsRatePct: null },
      CURRENCY,
    );
    expect(result.tipText).toBe('Keep tracking your spending to stay on top of your budget.');
  });

  it('budget_exceeded: headline reports the category total spend', () => {
    const result = buildTemplateInsight(
      { flaggedPatterns: [{ kind: 'budget_exceeded', categoryId: 2, categoryName: 'Transport', amount: '150.00', avg3: null, growthPct: null, weeklyCap: null }], savingsRatePct: null },
      CURRENCY,
    );
    expect(result.summaryText).toBe('Transport went over its budget — you spent $150.00 in it this month.');
  });

  it('budget_exceeded with a null amount defaults to 0', () => {
    const result = buildTemplateInsight(
      { flaggedPatterns: [{ kind: 'budget_exceeded', categoryId: 2, categoryName: 'Transport', amount: null, avg3: null, growthPct: null, weeklyCap: null }], savingsRatePct: null },
      CURRENCY,
    );
    expect(result.summaryText).toBe('Transport went over its budget — you spent $0.00 in it this month.');
  });

  it('new_category: headline reports the new category and its total', () => {
    const result = buildTemplateInsight(
      { flaggedPatterns: [{ kind: 'new_category', categoryId: 3, categoryName: 'Gadgets', amount: '75.00', avg3: null, growthPct: null, weeklyCap: null }], savingsRatePct: null },
      CURRENCY,
    );
    expect(result.summaryText).toBe('Gadgets is a new expense category this month, totalling $75.00.');
  });

  it('a positive savings rate is appended as a second sentence', () => {
    const result = buildTemplateInsight({ flaggedPatterns: [], savingsRatePct: 25 }, CURRENCY);
    expect(result.summaryText).toBe('Your spending looked steady this month — no unusual patterns detected. You saved 25% of your income this month.');
  });

  it('a negative savings rate reports overspending instead of a percentage', () => {
    const result = buildTemplateInsight({ flaggedPatterns: [], savingsRatePct: -10 }, CURRENCY);
    expect(result.summaryText).toBe('Your spending looked steady this month — no unusual patterns detected. You spent more than you earned this month.');
  });

  it('a savings rate of exactly 0 is treated as the "saved" branch, not overspending', () => {
    const result = buildTemplateInsight({ flaggedPatterns: [], savingsRatePct: 0 }, CURRENCY);
    expect(result.summaryText).toContain('You saved 0% of your income this month.');
  });
});
