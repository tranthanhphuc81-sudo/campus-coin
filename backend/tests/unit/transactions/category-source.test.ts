/**
 * category-source.test.ts
 * Unit tests for `deriveCategorySource` (backend/src/modules/transactions/categorySource.ts):
 * all four possible outcomes.
 * Spec: docs/spec/05b §5.6 (AI categorization) · Rules: D1
 */
import { describe, expect, it } from 'vitest';
import { deriveCategorySource } from '../../../src/modules/transactions/categorySource.js';

describe('deriveCategorySource', () => {
  it('no AI suggestion -> user', () => {
    expect(deriveCategorySource({ categoryId: 1, aiSuggestedCategoryId: null, ruleCategoryId: null })).toBe('user');
  });

  it('no AI suggestion (undefined) -> user', () => {
    expect(deriveCategorySource({ categoryId: 1, aiSuggestedCategoryId: undefined, ruleCategoryId: null })).toBe('user');
  });

  it('chosen category differs from the suggestion -> ai_overridden', () => {
    expect(deriveCategorySource({ categoryId: 1, aiSuggestedCategoryId: 2, ruleCategoryId: null })).toBe('ai_overridden');
  });

  it('chosen matches the suggestion AND the tier-1 rule -> rule', () => {
    expect(deriveCategorySource({ categoryId: 2, aiSuggestedCategoryId: 2, ruleCategoryId: 2 })).toBe('rule');
  });

  it('chosen matches the suggestion but the rule points elsewhere -> ai_accepted', () => {
    expect(deriveCategorySource({ categoryId: 2, aiSuggestedCategoryId: 2, ruleCategoryId: 9 })).toBe('ai_accepted');
  });

  it('chosen matches the suggestion, no rule at all -> ai_accepted', () => {
    expect(deriveCategorySource({ categoryId: 2, aiSuggestedCategoryId: 2, ruleCategoryId: null })).toBe('ai_accepted');
  });
});
