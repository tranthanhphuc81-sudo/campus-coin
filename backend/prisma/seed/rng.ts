/**
 * rng.ts
 * Deterministic pseudo-random helpers for the demo seed (P17): every run must produce
 * byte-identical data given the same seed, so re-running `--demo` never changes the numbers an
 * examiner already saw. Not cryptographically secure — never use for anything security-sensitive.
 * Main exports: mulberry32, randomInt, pick, randomAmount
 * Spec: docs/spec/12 §12.3 (Bảng 69 – deterministic test datasets)
 */

/**
 * Creates a seeded, deterministic PRNG (mulberry32).
 * @param seed - 32-bit integer seed; the same seed always yields the same sequence.
 * @returns A function producing floats in `[0, 1)` on each call.
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic integer in `[min, max]` inclusive.
 * @param rng - PRNG created by {@link mulberry32}.
 * @param min - Lower bound (inclusive).
 * @param max - Upper bound (inclusive).
 */
export function randomInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/**
 * Deterministically picks one element from a non-empty array.
 * @param rng - PRNG created by {@link mulberry32}.
 * @param items - Non-empty source array.
 * @throws RangeError when `items` is empty.
 */
export function pick<T>(rng: () => number, items: readonly T[]): T {
  if (items.length === 0) throw new RangeError('pick() requires a non-empty array.');
  return items[randomInt(rng, 0, items.length - 1)] as T;
}

/**
 * Deterministic money amount in `[min, max]`, rounded to 2 decimals, as a decimal string.
 * @param rng - PRNG created by {@link mulberry32}.
 * @param min - Lower bound (inclusive).
 * @param max - Upper bound (inclusive).
 */
export function randomAmount(rng: () => number, min: number, max: number): string {
  const value = min + rng() * (max - min);
  return value.toFixed(2);
}
