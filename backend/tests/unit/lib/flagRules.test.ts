/**
 * flagRules.test.ts
 * Unit tests for the anomaly/duplicate detector's pure predicates (src/lib/flagRules.ts).
 * Spec: docs/spec/05c §5.14 (anomaly/duplicate detection) · docs/spec/12 (testing plan) · TC-24/TC-25
 */
import { describe, expect, it } from 'vitest';
import { findDuplicateMatch, isAnomalousAmount, type DuplicateCandidate } from '../../../src/lib/flagRules.js';

describe('isAnomalousAmount', () => {
  it('TC-24: flags a 500 expense against 5 peers of 10.00 each, with no allowance baseline', () => {
    const peers = ['10.00', '10.00', '10.00', '10.00', '10.00'];
    expect(isAnomalousAmount('500.00', peers, null)).toBe(true);
  });

  it('returns false with fewer than ANOMALY_MIN_SAMPLE (5) peers, even for an extreme amount', () => {
    const peers = ['10.00', '10.00', '10.00', '10.00'];
    expect(isAnomalousAmount('500.00', peers, null)).toBe(false);
  });

  it('stdDev=0 (identical peers) with only a modest increase does not fire the median rule either', () => {
    // median=10.00, 3x median = 30.00; 15.00 is well under it, and stdDev=0 disables the sigma rule.
    const peers = ['10.00', '10.00', '10.00', '10.00', '10.00'];
    expect(isAnomalousAmount('15.00', peers, null)).toBe(false);
  });

  it('sigma rule alone can fire even when the median rule would not', () => {
    // mean=10, sample stdDev ~= 1.5811 (Bessel's correction) -> mean + 3*stdDev ~= 14.7434.
    // median=10 -> 3x median = 30. 20.00 clears the sigma threshold but not the median one.
    const peers = ['10.00', '12.00', '9.00', '11.00', '8.00'];
    expect(isAnomalousAmount('20.00', peers, null)).toBe(true);
  });

  it('a high allowance baseline can still block an otherwise-anomalous amount (20% share too low)', () => {
    // 20% of 5000.00 = 1000.00; 500.00 is not above it, so the allowance gate blocks the flag.
    const peers = ['10.00', '10.00', '10.00', '10.00', '10.00'];
    expect(isAnomalousAmount('500.00', peers, '5000.00')).toBe(false);
  });

  it('a low allowance baseline still permits the flag (20% share is cleared)', () => {
    // 20% of 1000.00 = 200.00; 500.00 clears it, so the allowance gate passes.
    const peers = ['10.00', '10.00', '10.00', '10.00', '10.00'];
    expect(isAnomalousAmount('500.00', peers, '1000.00')).toBe(true);
  });

  it('a null allowance baseline always passes the gate', () => {
    const peers = ['10.00', '10.00', '10.00', '10.00', '10.00'];
    expect(isAnomalousAmount('500.00', peers, null)).toBe(true);
  });

  // Peers are pre-filtered by the repository to same-category, expense-only transactions before
  // ever reaching this predicate — there is no income-vs-expense case for this function to guard
  // against, so no such test exists here.
});

describe('findDuplicateMatch', () => {
  const subject = { id: 'subject-1', categoryId: 1, merchantKey: 'campus cafe' };

  it('matches a candidate with the same categoryId regardless of merchantKey', () => {
    const candidates: DuplicateCandidate[] = [{ id: 'c1', categoryId: 1, merchantKey: 'totally different' }];
    expect(findDuplicateMatch(subject, candidates)?.id).toBe('c1');
  });

  it('matches a different categoryId when merchantKey edit distance is 1', () => {
    const candidates: DuplicateCandidate[] = [{ id: 'c1', categoryId: 2, merchantKey: 'campus cafe.' }];
    expect(findDuplicateMatch(subject, candidates)?.id).toBe('c1');
  });

  it('matches a different categoryId when merchantKey edit distance is 2', () => {
    const candidates: DuplicateCandidate[] = [{ id: 'c1', categoryId: 2, merchantKey: 'campus cafex.' }];
    expect(findDuplicateMatch(subject, candidates)?.id).toBe('c1');
  });

  it('does not match a different categoryId when merchantKey edit distance is 3', () => {
    // "campus cafe" + 3 appended chars = exactly 3 insertions (distance 3), over the max of 2.
    const candidates: DuplicateCandidate[] = [{ id: 'c1', categoryId: 2, merchantKey: 'campus cafexyz' }];
    expect(findDuplicateMatch(subject, candidates)).toBeNull();
  });

  it('does not match when one or both merchantKeys are null and categoryId differs', () => {
    const subjectNullKey = { id: 'subject-1', categoryId: 1, merchantKey: null };
    const candidates: DuplicateCandidate[] = [{ id: 'c1', categoryId: 2, merchantKey: 'campus cafe' }];
    expect(findDuplicateMatch(subjectNullKey, candidates)).toBeNull();
    expect(findDuplicateMatch(subject, [{ id: 'c2', categoryId: 2, merchantKey: null }])).toBeNull();
  });

  it('excludes a candidate whose id equals the subject id, even if it would otherwise match trivially', () => {
    const candidates: DuplicateCandidate[] = [{ id: subject.id, categoryId: subject.categoryId, merchantKey: subject.merchantKey }];
    expect(findDuplicateMatch(subject, candidates)).toBeNull();
  });

  it('returns null when there is no candidate list match at all', () => {
    const candidates: DuplicateCandidate[] = [{ id: 'c1', categoryId: 2, merchantKey: 'unrelated place' }];
    expect(findDuplicateMatch(subject, candidates)).toBeNull();
  });
});
