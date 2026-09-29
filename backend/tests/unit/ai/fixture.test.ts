/**
 * fixture.test.ts
 * Sanity checks for the AI quality-measurement fixture (backend/tests/fixtures/categorization-100.json,
 * used by backend/tests/eval/ai-eval.ts): exactly 100 items, `expected` is one of the 12 default
 * category names matching its own `type`, both languages present.
 * Spec: docs/spec/05b (AI categorization) · Rules: D-eval (quality measurement)
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORIES } from '../../../prisma/seed/data/categories.js';
import fixture from '../../fixtures/categorization-100.json' with { type: 'json' };

const namesByType = new Map<string, Set<string>>([
  ['income', new Set(DEFAULT_CATEGORIES.filter((c) => c.type === 'income').map((c) => c.name))],
  ['expense', new Set(DEFAULT_CATEGORIES.filter((c) => c.type === 'expense').map((c) => c.name))],
]);

describe('categorization-100.json fixture', () => {
  it('has exactly 100 items', () => {
    expect(fixture.items).toHaveLength(100);
  });

  it('has a numeric version', () => {
    expect(fixture.version).toBe(1);
  });

  it('every item\'s `expected` is a default category name matching its own `type`', () => {
    for (const item of fixture.items) {
      const allowed = namesByType.get(item.type);
      expect(allowed, `unknown type "${item.type}"`).toBeDefined();
      expect(allowed!.has(item.expected), `"${item.expected}" is not a ${item.type} default category`).toBe(true);
    }
  });

  it('every item has a non-empty description and a valid lang tag', () => {
    for (const item of fixture.items) {
      expect(item.description.trim().length).toBeGreaterThan(0);
      expect(['en', 'vi']).toContain(item.lang);
    }
  });

  it('contains both English and Vietnamese items, roughly balanced', () => {
    const counts = { en: 0, vi: 0 };
    for (const item of fixture.items) counts[item.lang as 'en' | 'vi']++;
    expect(counts.en).toBeGreaterThan(30);
    expect(counts.vi).toBeGreaterThan(30);
  });

  it('is roughly 70% expense / 30% income', () => {
    const expense = fixture.items.filter((i) => i.type === 'expense').length;
    expect(expense).toBeGreaterThanOrEqual(60);
    expect(expense).toBeLessThanOrEqual(80);
  });

  it('includes every mandatory item from the phase spec', () => {
    const descriptions = fixture.items.map((i) => i.description);
    expect(descriptions).toContain('Campus Cafe');
    expect(descriptions).toContain('Grab');
    expect(descriptions).toContain('Netflix');
    expect(descriptions.some((d) => d === 'đồ án' || d.startsWith('đồ án'))).toBe(true);
    expect(descriptions.some((d) => d.startsWith('đồ ăn trưa'))).toBe(true);
  });

  it('has no obvious PII (email/phone-shaped strings)', () => {
    for (const item of fixture.items) {
      expect(item.description).not.toMatch(/@/);
      expect(item.description).not.toMatch(/\d{6,}/);
    }
  });
});
