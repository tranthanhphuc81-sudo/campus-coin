/**
 * flagRules.ts
 * Pure predicates behind the anomaly/duplicate transaction detector (docs/spec/05c §5.14):
 * `isAnomalousAmount` (BR-TX-ANOMALY) and `findDuplicateMatch` (BR-TX-DUP). No DB access — the
 * caller (`modules/transactions/transactions.flags.ts`) gathers peers/candidates from Prisma and
 * hands them to these functions. Kept in `lib/` (not the `transactions` module) so they can be
 * unit-tested with no DB and no event bus at all.
 * Main exports: isAnomalousAmount, DuplicateCandidate, findDuplicateMatch
 * Spec: docs/spec/05c §5.14
 */
import {
  ANOMALY_ALLOWANCE_SHARE_PCT,
  ANOMALY_MEDIAN_MULTIPLIER,
  ANOMALY_MIN_SAMPLE,
  ANOMALY_SIGMA_MULTIPLIER,
  DUPLICATE_MAX_EDIT_DISTANCE,
} from '@campuscoin/shared';
import { isWithinEditDistance } from './levenshtein.js';
import { type MoneyInput, toMoney } from './money.js';
import { mean, median, sampleStdDev } from './stats.js';

/**
 * BR-TX-ANOMALY: tells whether `amount` is an anomalous expense compared to its category's recent
 * peers. Fewer than {@link ANOMALY_MIN_SAMPLE} peers -> always `false` (not enough history to say
 * anything). Otherwise the amount must both (a) fail a statistical test — above
 * `mean + {@link ANOMALY_SIGMA_MULTIPLIER} * stdDev` (only checked once `peers.length >= 2`, since
 * a sample stdDev needs at least 2 points) OR above `{@link ANOMALY_MEDIAN_MULTIPLIER} * median` —
 * AND (b) pass the allowance gate: with no baseline set, the gate always passes; with a baseline,
 * the amount must exceed {@link ANOMALY_ALLOWANCE_SHARE_PCT}% of it (a large amount relative to
 * peers that is still small relative to the user's own means is not worth flagging).
 *
 * Peers are assumed to already be same-category, `expense`-type transactions (the repository query
 * that produces them filters on both) — this function does not re-check `type` itself.
 *
 * @param amount - The candidate expense amount.
 * @param peers - Trailing same-category expense amounts, excluding the subject itself.
 * @param allowanceBaseline - The user's `monthlyAllowanceBaseline`, or `null` when unset.
 * @returns `true` when the amount should be flagged `isAnomaly`.
 */
export function isAnomalousAmount(
  amount: MoneyInput,
  peers: readonly MoneyInput[],
  allowanceBaseline: MoneyInput | null,
): boolean {
  if (peers.length < ANOMALY_MIN_SAMPLE) return false;

  const amt = toMoney(amount);
  const peerMean = mean(peers);
  const peerMedian = median(peers);
  const peerStdDev = peers.length >= 2 ? sampleStdDev(peers) : null;

  const sigmaRule = peerStdDev !== null && peerStdDev.gt(0) && amt.gt(peerMean.add(peerStdDev.mul(ANOMALY_SIGMA_MULTIPLIER)));
  const medianRule = amt.gt(peerMedian.mul(ANOMALY_MEDIAN_MULTIPLIER));
  const statRule = sigmaRule || medianRule;

  const allowanceGate =
    allowanceBaseline === null || amt.gt(toMoney(allowanceBaseline).mul(ANOMALY_ALLOWANCE_SHARE_PCT).div(100));

  return statRule && allowanceGate;
}

/** One same-user candidate transaction considered as a possible duplicate of the subject. */
export interface DuplicateCandidate {
  id: string;
  categoryId: number;
  merchantKey: string | null;
}

/**
 * BR-TX-DUP: finds the first candidate that looks like the same real-world transaction as
 * `subject` — same category, OR a merchant key within {@link DUPLICATE_MAX_EDIT_DISTANCE} edits of
 * the subject's own (both keys must be non-null; a missing merchant key never matches on its own).
 * Never matches a candidate whose `id` equals the subject's own id (guards against ever flagging a
 * transaction as a duplicate of itself, even though callers are also expected to have already
 * excluded the subject from the candidate list).
 * @param subject - The transaction being evaluated (normally the newer of the two).
 * @param candidates - Same-user, same-amount/type transactions close in time (already narrowed by
 *   the repository query) to check `subject` against.
 * @returns The first matching candidate, or `null` when none match.
 */
export function findDuplicateMatch(
  subject: { id: string; categoryId: number; merchantKey: string | null },
  candidates: readonly DuplicateCandidate[],
): DuplicateCandidate | null {
  for (const candidate of candidates) {
    if (candidate.id === subject.id) continue;
    if (candidate.categoryId === subject.categoryId) return candidate;
    if (
      subject.merchantKey !== null &&
      candidate.merchantKey !== null &&
      isWithinEditDistance(subject.merchantKey, candidate.merchantKey, DUPLICATE_MAX_EDIT_DISTANCE)
    ) {
      return candidate;
    }
  }
  return null;
}
