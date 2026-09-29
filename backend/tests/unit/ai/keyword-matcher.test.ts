/**
 * keyword-matcher.test.ts
 * Unit tests for `matchKeyword` (backend/src/modules/ai/ai.keywords.ts): longest match wins,
 * accented index tried before unaccented, the "đồ án" vs "đồ ăn"/"do an" diacritic-collision
 * case, type filtering, and unaccented normalisation of brand-name keywords.
 * Spec: docs/spec/05b §5.6 (AI categorization, tier 2)
 */
import { describe, expect, it } from 'vitest';
import { matchKeyword } from '../../../src/modules/ai/ai.keywords.js';
import { DEFAULT_CATEGORIES } from '../../../prisma/seed/data/categories.js';

const INCOME_NAMES = new Set(DEFAULT_CATEGORIES.filter((c) => c.type === 'income').map((c) => c.name));
const EXPENSE_NAMES = new Set(DEFAULT_CATEGORIES.filter((c) => c.type === 'expense').map((c) => c.name));

describe('matchKeyword', () => {
  it('longest match wins: "Amazon Prime" resolves to Subscriptions, not the shorter "amazon" (Miscellaneous)', () => {
    expect(matchKeyword('Amazon Prime renewal', EXPENSE_NAMES)).toBe('Subscriptions');
  });

  it('a shorter, unrelated description still resolves via the single-word keyword', () => {
    expect(matchKeyword('Amazon order', EXPENSE_NAMES)).toBe('Miscellaneous');
  });

  it('resolves the accented phrase "đồ án" to Academics', () => {
    expect(matchKeyword('đồ án tốt nghiệp', EXPENSE_NAMES)).toBe('Academics');
  });

  it('resolves "đồ ăn trưa" (Food) distinctly from "đồ án" (Academics)', () => {
    expect(matchKeyword('đồ ăn trưa nay', EXPENSE_NAMES)).toBe('Food');
  });

  it('the unaccented ambiguous form "do an" (Academics vs Food) resolves to null', () => {
    expect(matchKeyword('do an', EXPENSE_NAMES)).toBeNull();
  });

  it('tries the accented index first: "trợ cấp học tập" resolves to Scholarship (longest), not Allowance', () => {
    expect(matchKeyword('trợ cấp học tập tháng này', INCOME_NAMES)).toBe('Scholarship');
  });

  it('filters by the allowed category set (type): "Grab" only resolves when Transport (expense) is allowed', () => {
    expect(matchKeyword('Grab ride home', EXPENSE_NAMES)).toBe('Transport');
    expect(matchKeyword('Grab ride home', INCOME_NAMES)).toBeNull();
  });

  it('normalises "7-Eleven" (digit + hyphen stripped) to match the "7-eleven" keyword', () => {
    expect(matchKeyword('7-Eleven snack run', EXPENSE_NAMES)).toBe('Food');
  });

  it('normalises "The Coffee House #3" (stop-word + digit stripped) to match "the coffee house"', () => {
    expect(matchKeyword('The Coffee House #3', EXPENSE_NAMES)).toBe('Food');
  });

  it('returns null for a description with nothing recognisable', () => {
    expect(matchKeyword('xyz123', EXPENSE_NAMES)).toBeNull();
  });

  it('returns null for an empty/whitespace-only description', () => {
    expect(matchKeyword('   ', EXPENSE_NAMES)).toBeNull();
  });
});
