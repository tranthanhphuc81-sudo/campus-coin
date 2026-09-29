/**
 * levenshtein.ts
 * Small, dependency-free Levenshtein (edit) distance used by the duplicate-transaction detector
 * (backend/src/events/handlers/*, P14 §5.14) to compare normalised merchant keys. Operates on
 * Unicode code points (not UTF-16 code units), so multi-byte characters (accents, emoji) each
 * count as one edit unit. This is classic Levenshtein, NOT Damerau-Levenshtein: a transposition
 * of two adjacent characters costs 2, not 1.
 * Main exports: levenshtein, isWithinEditDistance
 * Spec: docs/spec/05c §5.14 (DUPLICATE_MAX_EDIT_DISTANCE)
 */

/**
 * Computes the Levenshtein edit distance between two strings.
 *
 * Iterative two-row dynamic programming: O(n*m) time, O(min(n,m)) memory (the shorter string is
 * used as the row so memory scales with the smaller input).
 *
 * @param a - First string.
 * @param b - Second string.
 * @param maxDistance - When given, the search bails out as soon as the true distance is known to
 *   exceed it, returning `maxDistance + 1` (an upper-bound sentinel, not the exact distance) —
 *   callers that only need "is this within N edits" avoid the full O(n*m) cost on far-apart
 *   strings. Omit it to always get the exact distance.
 * @returns The edit distance, or `maxDistance + 1` when the bounded search bails out early.
 */
export function levenshtein(a: string, b: string, maxDistance?: number): number {
  if (a === b) return 0;

  const av = Array.from(a);
  const bv = Array.from(b);
  if (av.length === 0) return maxDistance !== undefined ? Math.min(bv.length, maxDistance + 1) : bv.length;
  if (bv.length === 0) return maxDistance !== undefined ? Math.min(av.length, maxDistance + 1) : av.length;

  if (maxDistance !== undefined && Math.abs(av.length - bv.length) > maxDistance) {
    return maxDistance + 1;
  }

  // Row = shorter string, so the O(min(n,m)) memory bound holds regardless of argument order.
  const [shorter, longer] = av.length <= bv.length ? [av, bv] : [bv, av];

  let prevRow = Array.from({ length: shorter.length + 1 }, (_, i) => i);
  for (let i = 1; i <= longer.length; i += 1) {
    const currRow = new Array<number>(shorter.length + 1);
    currRow[0] = i;
    let rowMin = currRow[0];
    for (let j = 1; j <= shorter.length; j += 1) {
      const cost = longer[i - 1] === shorter[j - 1] ? 0 : 1;
      // j/j-1 are always in [0, shorter.length] here, so these indices are never out of bounds.
      const value = Math.min(
        prevRow[j]! + 1, // deletion
        currRow[j - 1]! + 1, // insertion
        prevRow[j - 1]! + cost, // substitution
      );
      currRow[j] = value;
      if (value < rowMin) rowMin = value;
    }
    // Every cell in the final row is >= rowMin, so once rowMin alone exceeds maxDistance the
    // exact distance can no longer come back down to it — safe to bail early.
    if (maxDistance !== undefined && rowMin > maxDistance) return maxDistance + 1;
    prevRow = currRow;
  }

  const distance = prevRow[shorter.length]!;
  if (maxDistance !== undefined && distance > maxDistance) return maxDistance + 1;
  return distance;
}

/**
 * Tells whether two strings are within `max` edits of each other, without needing the exact
 * distance for far-apart strings (see {@link levenshtein}'s `maxDistance` bail-out).
 * @param a - First string.
 * @param b - Second string.
 * @param max - Maximum allowed edit distance (e.g. {@link DUPLICATE_MAX_EDIT_DISTANCE}).
 * @returns true when `levenshtein(a, b) <= max`.
 */
export function isWithinEditDistance(a: string, b: string, max: number): boolean {
  return levenshtein(a, b, max) <= max;
}
