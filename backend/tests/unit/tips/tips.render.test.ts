/**
 * tips.render.test.ts
 * Unit tests for the pure template rendering + ranking math: single-pass substitution, no
 * HTML-escaping, control-char stripping/truncation, deterministic template selection, and the
 * confidence/recency curves.
 * Spec: docs/spec/05b §5.10 (Bảng 23)
 */
import { describe, expect, it } from 'vitest';
import { TIP_CONFIDENCE_1_MONTH, TIP_CONFIDENCE_2_MONTHS, TIP_CONFIDENCE_3_PLUS_MONTHS, TIP_RECENCY_FLOOR, TipRuleType } from '@campuscoin/shared';
import { Decimal } from '../../../src/lib/money.js';
import { confidenceFor, computeScore, recencyFor, renderTemplate, selectTemplate } from '../../../src/modules/tips/tips.render.js';
import type { TipTemplateModel } from '../../../src/generated/prisma/models/TipTemplate.js';

function template(overrides: Partial<TipTemplateModel> = {}): TipTemplateModel {
  return {
    id: 1,
    code: 'T1',
    ruleType: TipRuleType.OVER_BUDGET,
    titleTpl: '{category} is over budget',
    bodyTpl: 'You will go over by {amount}.',
    locale: 'en',
    isActive: true,
    createdBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as TipTemplateModel;
}

describe('renderTemplate', () => {
  it('substitutes {category}/{amount}/{percent} in a single pass', () => {
    const out = renderTemplate('{category}: {amount} ({percent}%)', { category: 'Food', amount: '10.00', percent: '20' }, 200);
    expect(out).toBe('Food: 10.00 (20%)');
  });

  it('does not re-expand a placeholder introduced by a substituted value', () => {
    // A category literally named "{amount}" must not get re-substituted by the amount value.
    const out = renderTemplate('{category} used {amount}', { category: '{amount}', amount: '5.00' }, 200);
    expect(out).toBe('{amount} used 5.00');
  });

  it('renders an unset placeholder as an empty string', () => {
    expect(renderTemplate('Save {amount} on {category}', { amount: '5.00' }, 200)).toBe('Save 5.00 on ');
  });

  it('does not HTML-escape (React already escapes on render)', () => {
    expect(renderTemplate('{category} spending', { category: 'Food & Drinks' }, 200)).toBe('Food & Drinks spending');
  });

  it('strips ASCII control characters', () => {
    expect(renderTemplate('Hello\u0000World\u007F!', {}, 200)).toBe('HelloWorld!');
  });

  it('truncates to maxLength', () => {
    expect(renderTemplate('abcdefghij', {}, 5)).toBe('abcde');
  });
});

describe('selectTemplate', () => {
  const t1 = template({ id: 1, code: 'T1', titleTpl: '{category} tip', bodyTpl: 'Save {amount}.' });
  const t2 = template({ id: 2, code: 'T2', titleTpl: 'General tip', bodyTpl: 'No placeholders here.' });
  const t3 = template({ id: 3, code: 'T3', ruleType: TipRuleType.GENERAL, titleTpl: 'Other rule', bodyTpl: 'x' });
  const inactive = template({ id: 4, code: 'T4', isActive: false, titleTpl: 'Inactive', bodyTpl: 'x' });

  it('skips templates whose placeholders are not satisfiable by vars', () => {
    // t1 needs {category} and {amount}; only amount is provided -> t1 disqualified, only t2 qualifies.
    const picked = selectTemplate([t1, t2], TipRuleType.OVER_BUDGET, { amount: '5.00' }, 'seed-a');
    expect(picked?.code).toBe('T2');
  });

  it('skips inactive templates and templates of a different rule type', () => {
    const picked = selectTemplate([t3, inactive, t2], TipRuleType.OVER_BUDGET, {}, 'seed-b');
    expect(picked?.code).toBe('T2');
  });

  it('returns null when no active template of the rule type has its placeholders satisfied', () => {
    expect(selectTemplate([t1], TipRuleType.OVER_BUDGET, {}, 'seed-c')).toBeNull();
    expect(selectTemplate([], TipRuleType.OVER_BUDGET, {}, 'seed-d')).toBeNull();
  });

  it('is deterministic given the same seed', () => {
    const templates = [t2, template({ id: 5, code: 'T5', titleTpl: 'Another', bodyTpl: 'general tip' })];
    const first = selectTemplate(templates, TipRuleType.OVER_BUDGET, {}, 'stable-seed');
    const second = selectTemplate(templates, TipRuleType.OVER_BUDGET, {}, 'stable-seed');
    expect(first?.code).toBe(second?.code);
  });
});

describe('confidenceFor', () => {
  it('returns the 1-month tier for 0 and 1 months available', () => {
    expect(confidenceFor(0)).toBe(TIP_CONFIDENCE_1_MONTH);
    expect(confidenceFor(1)).toBe(TIP_CONFIDENCE_1_MONTH);
  });

  it('returns the 2-month tier for exactly 2 months', () => {
    expect(confidenceFor(2)).toBe(TIP_CONFIDENCE_2_MONTHS);
  });

  it('returns the 3-plus tier for 3 and above', () => {
    expect(confidenceFor(3)).toBe(TIP_CONFIDENCE_3_PLUS_MONTHS);
    expect(confidenceFor(5)).toBe(TIP_CONFIDENCE_3_PLUS_MONTHS);
  });
});

describe('recencyFor', () => {
  it('returns 1.0 for a brand-new (or pinned) tip', () => {
    expect(recencyFor(null, '2026-09-28')).toBe(1.0);
  });

  it('decays linearly toward the floor', () => {
    // TIP_RECENCY_DECAY_DAYS = 14; 7 days old -> 1 - 7/14 = 0.5
    expect(recencyFor('2026-09-21', '2026-09-28')).toBeCloseTo(0.5, 5);
  });

  it('never drops below TIP_RECENCY_FLOOR', () => {
    expect(recencyFor('2026-01-01', '2026-09-28')).toBe(TIP_RECENCY_FLOOR);
  });
});

describe('computeScore', () => {
  it('multiplies impact x confidence x recency, rounded to 4 decimals', () => {
    const score = computeScore(new Decimal('100'), '0.75', 0.5);
    expect(score.toString()).toBe('37.5');
  });

  it('rounds half-up to 4 decimal places', () => {
    const score = computeScore(new Decimal('1'), '0.333333', 1);
    expect(score.toFixed(4)).toBe('0.3333');
  });
});
