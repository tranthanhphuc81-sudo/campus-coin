/**
 * levenshtein.test.ts
 * Unit tests for the Levenshtein edit-distance helper (src/lib/levenshtein.ts).
 * Spec: docs/spec/05c §5.14 (duplicate detection) · docs/spec/12 (testing plan)
 */
import { describe, expect, it } from 'vitest';
import { isWithinEditDistance, levenshtein } from '../../../src/lib/levenshtein.js';

describe('levenshtein (unbounded)', () => {
  it('is 0 for identical strings', () => {
    expect(levenshtein('abc', 'abc')).toBe(0);
    expect(levenshtein('', '')).toBe(0);
  });

  it('is the other string length when one side is empty', () => {
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', '')).toBe(3);
  });

  it('computes the classic kitten/sitting example', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
  });

  it('is 1 for a single substitution/insertion/deletion', () => {
    expect(levenshtein('cat', 'cot')).toBe(1); // substitution
    expect(levenshtein('cat', 'cats')).toBe(1); // insertion
    expect(levenshtein('cats', 'cat')).toBe(1); // deletion
  });

  it('is NOT Damerau-Levenshtein: an adjacent transposition costs 2', () => {
    expect(levenshtein('ab', 'ba')).toBe(2);
  });

  it('is symmetric', () => {
    expect(levenshtein('flaw', 'lawn')).toBe(levenshtein('lawn', 'flaw'));
    expect(levenshtein('kitten', 'sitting')).toBe(levenshtein('sitting', 'kitten'));
  });

  it('counts Unicode code points, not UTF-16 code units', () => {
    expect(levenshtein('café', 'cafe')).toBe(1);
    // A combining accent (2 UTF-16 units, 2 code points here) vs a precomposed one still yields a
    // small, code-point-based distance rather than a UTF-16-length-based one.
    const combining = 'café'; // "cafe" + combining acute accent
    // 5 code points vs 4: "caf" matches, then "e"+accent (2 code points) vs precomposed "é" (1)
    // shares no code point with either -> substitute + delete = 2, not the naive UTF-16-length 1.
    expect(levenshtein(combining, 'café')).toBe(2);
    // An astral emoji is 1 code point (but 2 UTF-16 code units) — must not be double-counted.
    expect(levenshtein('a😀b', 'a b')).toBe(1);
  });
});

describe('levenshtein (bounded)', () => {
  it('returns max+1 via the length-difference shortcut', () => {
    // |len diff| = 5 > maxDistance = 2 -> bails without running the DP at all.
    expect(levenshtein('a', 'abcdef', 2)).toBe(3);
  });

  it('returns max+1 via the row-minimum early exit, not just the length shortcut', () => {
    // Same length (diff shortcut does not trip) but every character differs, so row minimums
    // climb past maxDistance and the row-minimum bail-out must trigger.
    const a = 'abcdefgh';
    const b = 'ijklmnop';
    expect(a.length).toBe(b.length);
    expect(levenshtein(a, b, 2)).toBe(3);
  });

  it('returns the exact distance when it is within bounds', () => {
    expect(levenshtein('kitten', 'sitting', 5)).toBe(3);
    expect(levenshtein('kitten', 'sitting', 3)).toBe(3);
  });
});

describe('isWithinEditDistance', () => {
  it('matches near-identical merchant names within the duplicate-detection threshold', () => {
    expect(isWithinEditDistance('highlands coffee', 'highland cofee', 2)).toBe(true);
  });

  it('rejects strings further apart than max', () => {
    expect(isWithinEditDistance('kitten', 'sitting', 2)).toBe(false);
  });
});
