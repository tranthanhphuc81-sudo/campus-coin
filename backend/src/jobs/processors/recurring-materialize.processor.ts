/**
 * recurring-materialize.processor.ts
 * Worker processor for the `recurring.materialize` queue: for each active recurring rule whose
 * `nextRunDate` is due (checked in the rule's OWN user's timezone — D8), inserts the transaction(s)
 * it generates, capped at {@link RECURRING_CATCHUP_MAX} missed periods per run (D9: no-backfill on
 * create/edit/resume — catch-up only covers periods missed because the job itself did not run).
 * Re-running the job is always safe: `createSystemTransaction` swallows the
 * UNIQUE(recurringRuleId, recurringPeriod) violation for an already-materialized period (TC-14).
 * Main exports: processRecurringMaterialize, materializeDueRules
 * Spec: docs/spec/04 §4.5 (Table 13 – recurring.materialize) · docs/spec/05a §5.4.2
 */
import type { Job } from 'bullmq';
import { CategorySource, RECURRING_CATCHUP_MAX, SYSTEM_OWNER_KEY, TransactionSource, type TransactionType } from '@campuscoin/shared';
import { UserStatus } from '../../generated/prisma/enums.js';
import { addDays, fromDbDate, todayInTimeZone, toDbDate, type LocalDate } from '../../lib/dates.js';
import { logger } from '../../lib/logger.js';
import { toMoneyString } from '../../lib/money.js';
import { nextOccurrenceAfter, periodKey, ruleToSpec } from '../../lib/recurrence.js';
import { createSystemTransaction, emitTransactionEvent } from '../../modules/transactions/transactions.core.js';
import { recurringRepository, type RecurringRuleDueRow } from '../../modules/recurring/recurring.repository.js';

/** Rows fetched per page of {@link recurringRepository.findDueBatch}. */
const PAGE_SIZE = 200;
/** Safety cap on the occurrence walk below, guarding against a runaway loop from a future bug. */
const MAX_WALK_ITERATIONS = 5000;

/** Aggregate counters returned by one {@link materializeDueRules} run, also logged as a summary. */
export interface MaterializeRunResult {
  scanned: number;
  created: number;
  skipped: number;
  deactivated: number;
  failed: number;
  /** Rules whose `advance()` write was skipped because the rule changed (paused/edited)
   *  concurrently, mid-batch — not an error, just a lost race the next run will re-evaluate. */
  concurrentEditSkipped: number;
}

/** Mutable counters threaded through {@link processDueRule} (avoids returning/merging 6 numbers per rule). */
interface RunCounters {
  created: number;
  skipped: number;
  deactivated: number;
  concurrentEditSkipped: number;
}

/**
 * Walks every occurrence of `rule` from its `nextRunDate` up to (and including) `today`, capped at
 * the most recent {@link RECURRING_CATCHUP_MAX} periods (older ones are dropped — logged by the
 * caller). Also returns the next occurrence after `today` (or `null` past `endDate`), used to
 * advance the rule.
 */
function walkDueOccurrences(rule: RecurringRuleDueRow, today: LocalDate): { window: LocalDate[]; dropped: number; next: LocalDate | null } {
  const spec = ruleToSpec(rule);
  let cursor: LocalDate | null = fromDbDate(rule.nextRunDate);
  const window: LocalDate[] = [];
  let dropped = 0;
  let iterations = 0;

  while (cursor !== null && cursor <= today) {
    iterations += 1;
    if (iterations > MAX_WALK_ITERATIONS) {
      logger.error({ ruleId: rule.id }, '[recurring-materialize] runaway occurrence walk, aborting rule early');
      break;
    }
    window.push(cursor);
    if (window.length > RECURRING_CATCHUP_MAX) {
      window.shift();
      dropped += 1;
    }
    cursor = nextOccurrenceAfter(spec, cursor);
  }

  return { window, dropped, next: cursor };
}

/**
 * Processes one due rule: materializes its missed periods, advances `nextRunDate`
 * (deactivating it when there is no further occurrence), and updates `counters` in place. Never
 * throws for a business-as-usual outcome — the caller wraps this in `try/catch` per rule so one
 * rule's failure never stops the batch.
 */
async function processDueRule(rule: RecurringRuleDueRow, now: Date, counters: RunCounters): Promise<void> {
  if (rule.user.status !== UserStatus.active) return;

  const today = todayInTimeZone(rule.user.timezone, now);
  if (fromDbDate(rule.nextRunDate) > today) return; // Not due yet in this user's own timezone (D8).

  const { window, dropped, next } = walkDueOccurrences(rule, today);
  if (dropped > 0) {
    logger.warn({ ruleId: rule.id, dropped }, '[recurring-materialize] dropped missed periods beyond the catch-up cap');
  }

  for (const date of window) {
    const txn = await createSystemTransaction({
      userId: rule.userId,
      type: rule.type as TransactionType,
      categoryId: rule.categoryId,
      amount: toMoneyString(rule.amount),
      currency: rule.user.currency,
      description: rule.description,
      txnDate: date,
      source: TransactionSource.RECURRING,
      categorySource: CategorySource.USER,
      recurringRuleId: rule.id,
      recurringPeriod: periodKey(rule.frequency, date),
      changedBy: SYSTEM_OWNER_KEY,
    });
    if (txn === null) {
      counters.skipped += 1;
    } else {
      // Only after createSystemTransaction's own `$transaction` has committed (never inside it).
      emitTransactionEvent('created', txn);
      counters.created += 1;
    }
  }

  const lastOccurrence = window[window.length - 1] ?? fromDbDate(rule.nextRunDate);
  // BR: conditional on the ORIGINAL nextRunDate this rule was read with (rule.nextRunDate, from
  // findDueBatch) — if the user paused/edited it since, this matches zero rows and we must not
  // silently re-activate it or overwrite its freshly recomputed nextRunDate.
  const advanced = await recurringRepository.advance(
    rule.id,
    rule.nextRunDate,
    next ? toDbDate(next) : null,
    toDbDate(lastOccurrence),
    next !== null,
  );
  if (advanced.count === 0) {
    logger.warn({ ruleId: rule.id }, '[recurring-materialize] rule changed concurrently (paused/edited) mid-batch; skipped advancing it');
    counters.concurrentEditSkipped += 1;
    return;
  }
  if (next === null) counters.deactivated += 1;
}

/**
 * Materializes every due recurring rule as of `now`. Exported separately (not just the BullMQ
 * processor) so tests can pass a fixed clock — BullMQ's processor only gets a `Job`, not a time.
 * @param now - The instant this run considers "now" (injectable for tests).
 * @returns Aggregate counters for the run.
 * @throws Error when at least one rule failed, so BullMQ retries the whole run (safe: re-running
 *   is idempotent via the UNIQUE(recurringRuleId, recurringPeriod) guard).
 */
export async function materializeDueRules(now: Date): Promise<MaterializeRunResult> {
  // A generous UTC+1-day upper bound catches every timezone (UTC-12..UTC+14) in one page; the
  // per-rule check in processDueRule does the precise per-user-timezone comparison (D8).
  const scanUntil = toDbDate(addDays(todayInTimeZone('UTC', now), 1));

  let cursorId = 0;
  let scanned = 0;
  let failed = 0;
  const counters: RunCounters = { created: 0, skipped: 0, deactivated: 0, concurrentEditSkipped: 0 };

  for (;;) {
    // Pages and rules are processed sequentially (not Promise.all): cursor pagination requires
    // each page's last id before fetching the next, and rules share `counters` by mutation.
    const page = await recurringRepository.findDueBatch(scanUntil, cursorId, PAGE_SIZE);
    if (page.length === 0) break;
    cursorId = page[page.length - 1]!.id;

    for (const rule of page) {
      scanned += 1;
      try {
        await processDueRule(rule, now, counters);
      } catch (err) {
        failed += 1;
        logger.error({ err, ruleId: rule.id }, '[recurring-materialize] failed to process rule');
      }
    }

    if (page.length < PAGE_SIZE) break;
  }

  const result: MaterializeRunResult = {
    scanned,
    created: counters.created,
    skipped: counters.skipped,
    deactivated: counters.deactivated,
    failed,
    concurrentEditSkipped: counters.concurrentEditSkipped,
  };
  logger.info(result, '[recurring-materialize] run complete');
  if (failed > 0) throw new Error(`[recurring-materialize] ${failed} rule(s) failed to process`);
  return result;
}

/** Processes one `recurring.materialize` run (BullMQ processor signature). */
export async function processRecurringMaterialize(_job: Job): Promise<void> {
  await materializeDueRules(new Date());
}
