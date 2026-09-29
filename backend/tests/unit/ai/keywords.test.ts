/**
 * keywords.test.ts
 * Sanity checks for the tier-2 keyword dictionary (src/modules/ai/keywords.v1.json):
 * versioned, large enough, only maps to default categories, no ambiguous keywords.
 * Spec: docs/spec/05b (AI categorisation) · docs/spec/06 §6.5
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORIES } from '../../../prisma/seed/data/categories.js';
import dictionary from '../../../src/modules/ai/keywords.v1.json' with { type: 'json' };

const entries = Object.entries(dictionary.categories);
const allKeywords = entries.flatMap(([, keywords]) => keywords);

describe('keywords.v1.json', () => {
  it('has a numeric version', () => {
    expect(dictionary.version).toBe(1);
  });

  it('has about 300 or more keywords', () => {
    expect(allKeywords.length).toBeGreaterThanOrEqual(250);
  });

  it('maps only to default category names, and covers all of them', () => {
    const names = DEFAULT_CATEGORIES.map((c) => c.name).sort();
    expect(entries.map(([name]) => name).sort()).toEqual(names);
  });

  it('never maps one keyword to two categories', () => {
    expect(new Set(allKeywords).size).toBe(allKeywords.length);
  });

  it('stores keywords lower-case and trimmed', () => {
    for (const k of allKeywords) expect(k).toBe(k.toLowerCase().trim());
  });

  it('contains both English and Vietnamese keywords', () => {
    expect(allKeywords).toEqual(
      expect.arrayContaining(['coffee', 'cơm', 'học phí', 'ktx', 'netflix', 'grab']),
    );
  });
});
